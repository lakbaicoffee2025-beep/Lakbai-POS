import { db } from "./db";
import { newId } from "../lib/id";
import { computeExpenseTotals } from "../lib/expenseMath";
import type { ExpenseReport, ExpenseLineItem, CashReturnStatus } from "../types";

export interface SaveExpenseReportInput {
  id?: string; // provide to update an existing report
  date: string;
  shiftId?: string;
  staffId: string;
  staffName: string;
  cashReceived: number;
  atmWithdrawal: number;
  items: ExpenseLineItem[];
  cashReturnStatus: CashReturnStatus;
  returnedTo?: string;
}

/**
 * Saves a cash-envelope expense report and mirrors its line items into the
 * plain `expenses` table (tagged with reportId) so shift cash-drawer
 * reconciliation and the Reports page keep working without needing to know
 * about the richer envelope shape.
 */
export async function saveExpenseReport(input: SaveExpenseReportInput): Promise<ExpenseReport> {
  const { amountReceived, totalExpenses, remainingCash } = computeExpenseTotals(
    input.cashReceived,
    input.atmWithdrawal,
    input.items
  );
  const now = Date.now();

  return db.transaction("rw", db.expenseReports, db.expenses, async () => {
    const id = input.id ?? newId();
    const existing = input.id ? await db.expenseReports.get(input.id) : undefined;

    const report: ExpenseReport = {
      id,
      date: input.date,
      shiftId: input.shiftId,
      staffId: input.staffId,
      staffName: input.staffName,
      cashReceived: input.cashReceived,
      atmWithdrawal: input.atmWithdrawal,
      amountReceived,
      items: input.items,
      totalExpenses,
      remainingCash,
      cashReturnStatus: remainingCash > 0 ? input.cashReturnStatus : null,
      returnedTo:
        remainingCash > 0 && input.cashReturnStatus === "returned" ? input.returnedTo : undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.expenseReports.put(report);

    // Replace this report's previously dual-written Expense lines, if any.
    await db.expenses.where("reportId").equals(id).delete();
    for (const item of input.items) {
      if (!item.description.trim() && item.amount <= 0) continue;
      await db.expenses.add({
        id: newId(),
        date: input.date,
        shiftId: input.shiftId,
        category: "Supplies",
        description: item.description || "(no description)",
        amount: item.amount,
        paymentMethod: "cash",
        recordedBy: input.staffId,
        recordedByName: input.staffName,
        createdAt: now,
        reportId: id,
        photoDataUrl: item.photoDataUrl,
      });
    }

    return report;
  });
}

export async function deleteExpenseReport(id: string): Promise<void> {
  await db.transaction("rw", db.expenseReports, db.expenses, async () => {
    await db.expenseReports.delete(id);
    await db.expenses.where("reportId").equals(id).delete();
  });
}

export function newLineItem(): ExpenseLineItem {
  return { id: newId(), description: "", amount: 0 };
}

/** Sum of unreturned positive remaining cash from the previous day's reports. */
export async function getYesterdayCarryover(
  date: string
): Promise<{ amount: number; reports: ExpenseReport[] }> {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() - 1);
  const yesterday = d.toISOString().split("T")[0];
  const reports = await db.expenseReports.where("date").equals(yesterday).toArray();
  const amount = reports.reduce((s, r) => s + Math.max(0, r.remainingCash), 0);
  return { amount, reports };
}

/**
 * Strips receipt photos from expense report items (and their mirrored
 * Expense rows) dated before the given cutoff, to free up local storage.
 * Amounts, descriptions, and every other field are left untouched — only
 * the (often large) base64 image data is cleared. Returns how many photos
 * were cleared.
 */
export async function clearOldExpensePhotos(cutoffDate: string): Promise<number> {
  return db.transaction("rw", db.expenseReports, db.expenses, async () => {
    let cleared = 0;

    const reports = await db.expenseReports.where("date").below(cutoffDate).toArray();
    for (const r of reports) {
      if (!r.items.some((i) => i.photoDataUrl)) continue;
      const items = r.items.map((i) => {
        if (!i.photoDataUrl) return i;
        cleared++;
        const { photoDataUrl: _drop, ...rest } = i;
        return rest;
      });
      await db.expenseReports.update(r.id, { items });
    }

    const expenses = await db.expenses.where("date").below(cutoffDate).toArray();
    for (const e of expenses) {
      if (!e.photoDataUrl) continue;
      await db.expenses.update(e.id, { photoDataUrl: undefined });
    }

    return cleared;
  });
}
