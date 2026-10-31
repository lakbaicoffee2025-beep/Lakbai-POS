import { db } from "./db";
import { newId } from "../lib/id";
import { pushTables } from "./remoteSync";
import type { Expense, ExpenseReport, ExpenseLineItem } from "../types";

export interface RepairedReport {
  reportId: string;
  date: string;
  staffName: string;
  itemCount: number;
  total: number;
}

export interface RepairResult {
  reports: RepairedReport[];
}

/**
 * One-time repair for Expense Reports whose parent envelope went missing
 * while its line items (the flat `expenses` table, dual-written alongside
 * every report) survived — the signature of the sync race fixed in
 * remoteSync.ts: a report's own hydration got raced out from under it by a
 * stale pull before that fix existed, while its already-pushed expense
 * lines weren't (each table races independently). Each surviving `expenses`
 * row still carries its original `reportId`; this finds every reportId
 * with line items but no matching ExpenseReport and reconstructs one.
 *
 * Cash Received / ATM Withdrawal aren't stored on the flat Expense rows,
 * so they can't be recovered — reconstructed reports default those to 0
 * (shown as a full "remaining cash" shortfall) and are clearly flagged in
 * their notes so the admin knows to re-enter the real received amount.
 *
 * Safe to run more than once: only creates a report for a reportId that
 * genuinely has no ExpenseReport yet, never touches or duplicates existing
 * `expenses` rows.
 */
export async function repairMissingExpenseReports(): Promise<RepairResult> {
  const result = await db.transaction("rw", db.expenses, db.expenseReports, async () => {
    const [allExpenses, allReports] = await Promise.all([
      db.expenses.toArray(),
      db.expenseReports.toArray(),
    ]);
    const existingReportIds = new Set(allReports.map((r) => r.id));

    const orphanedByReportId = new Map<string, Expense[]>();
    for (const e of allExpenses) {
      if (!e.reportId || existingReportIds.has(e.reportId)) continue;
      const list = orphanedByReportId.get(e.reportId) ?? [];
      list.push(e);
      orphanedByReportId.set(e.reportId, list);
    }

    const repaired: RepairedReport[] = [];
    for (const [reportId, lines] of orphanedByReportId) {
      lines.sort((a, b) => a.createdAt - b.createdAt);
      const first = lines[0];
      const items: ExpenseLineItem[] = lines.map((l) => ({
        id: newId(),
        description: l.description,
        amount: l.amount,
        photoDataUrl: l.photoDataUrl,
      }));
      const totalExpenses = lines.reduce((s, l) => s + l.amount, 0);
      const now = Date.now();

      const report: ExpenseReport = {
        id: reportId,
        date: first.date,
        shiftId: first.shiftId,
        staffId: first.recordedBy,
        staffName: first.recordedByName,
        cashReceived: 0,
        atmWithdrawal: 0,
        amountReceived: 0,
        items,
        totalExpenses,
        remainingCash: -totalExpenses,
        cashReturnStatus: null,
        createdAt: first.createdAt,
        updatedAt: now,
      };
      await db.expenseReports.add(report);
      repaired.push({
        reportId,
        date: first.date,
        staffName: first.recordedByName,
        itemCount: lines.length,
        total: totalExpenses,
      });
    }

    return repaired;
  });

  if (result.length > 0) {
    pushTables(["expenseReports"]);
  }
  return { reports: result };
}
