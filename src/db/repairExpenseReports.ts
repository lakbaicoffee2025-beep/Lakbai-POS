import { db } from "./db";
import { newId } from "../lib/id";
import { pushTables, pullAll } from "./remoteSync";
import type { Expense, ExpenseReport, ExpenseLineItem } from "../types";

// How long an orphaned expense line is given to still turn out to be a
// report that's simply still in flight (the device that saved it hasn't
// finished pushing the parent ExpenseReport yet) before this tool is
// willing to treat it as genuinely missing. Without this, running the
// repair soon after a report was saved — exactly when an admin checking
// Report History right after a staff member saves is most likely to click
// it — reconstructs a stub (Cash Received/ATM Withdrawal forced to 0, no
// photos) for a report that was never actually lost, just not synced yet.
// That stub is then pushed under the SAME id as the real report, and the
// per-row "local always wins" merge (see mergeRows in remoteSync.ts) means
// whichever one lands on the server last wins outright — so this doesn't
// just show a wrong number, it can permanently overwrite the real
// cashReceived and every receipt photo with a blank stub, with no way back
// short of the original device still having its local copy and
// successfully pushing again.
const MIN_ORPHAN_AGE_MS = 15 * 60 * 1000;

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
 * Pulls fresh from the server first and skips anything saved in the last
 * MIN_ORPHAN_AGE_MS before treating a reportId as missing (see above) — a
 * report that's simply still mid-sync must never be reconstructed, since
 * the stub would then overwrite the real one's cashReceived and photos the
 * moment it finally lands, with no way back.
 *
 * Safe to run more than once: only creates a report for a reportId that
 * genuinely has no ExpenseReport yet, never touches or duplicates existing
 * `expenses` rows.
 */
export async function repairMissingExpenseReports(): Promise<RepairResult> {
  // Refresh from the server first — repairing off anything less fresh risks
  // "finding" a report that actually already exists server-side and simply
  // hasn't reached this device yet, and reconstructing a blank stub over
  // it. If the server can't be reached right now, there's no way to tell
  // "genuinely missing" apart from "just not pulled yet", so refuse rather
  // than guess with something this destructive.
  const pullResult = await pullAll();
  if (pullResult === "failed") {
    throw new Error(
      "Could not confirm the latest data from the server — check your connection and try again."
    );
  }

  const result = await db.transaction("rw", db.expenses, db.expenseReports, async () => {
    const [allExpenses, allReports] = await Promise.all([
      db.expenses.toArray(),
      db.expenseReports.toArray(),
    ]);
    const existingReportIds = new Set(allReports.map((r) => r.id));

    const orphanedByReportId = new Map<string, Expense[]>();
    const now = Date.now();
    for (const e of allExpenses) {
      if (!e.reportId || existingReportIds.has(e.reportId)) continue;
      // Give a recent save a chance to still finish syncing its parent
      // report on its own — see MIN_ORPHAN_AGE_MS above.
      if (now - e.createdAt < MIN_ORPHAN_AGE_MS) continue;
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
