import { db } from "./db";
import { computeShiftSummary } from "../lib/shiftMath";

export interface ShiftEditInput {
  startingCash: number;
  countedCash?: number;
  countedGcash?: number;
  notes?: string;
}

/**
 * Admin-only correction of a shift's recorded amounts. Recomputes
 * expected cash/GCash and their variances from that shift's actual orders
 * and expenses, so the stored figures stay internally consistent after an
 * edit (e.g. fixing a starting-cash typo shifts the expected total too).
 * Enforced by the caller — the UI never renders this for non-admins.
 */
export async function adminUpdateShift(shiftId: string, input: ShiftEditInput): Promise<void> {
  await db.transaction("rw", db.shifts, db.orders, db.expenses, async () => {
    const shift = await db.shifts.get(shiftId);
    if (!shift) throw new Error("Shift not found");

    const merged = { ...shift, startingCash: input.startingCash };
    const [orders, expenses] = await Promise.all([
      db.orders.where("shiftId").equals(shiftId).toArray(),
      db.expenses.where("shiftId").equals(shiftId).toArray(),
    ]);
    const summary = computeShiftSummary(merged, orders, expenses);

    const update: Partial<typeof shift> = {
      startingCash: input.startingCash,
      notes: input.notes,
    };
    if (shift.status === "closed") {
      const countedCash = input.countedCash ?? shift.countedCash ?? 0;
      const countedGcash = input.countedGcash ?? shift.countedGcash ?? 0;
      update.countedCash = countedCash;
      update.countedGcash = countedGcash;
      update.expectedCash = summary.expectedCash;
      update.expectedGcash = summary.expectedGcash;
      update.cashVariance = countedCash - summary.expectedCash;
      update.gcashVariance = countedGcash - summary.expectedGcash;
    }
    await db.shifts.update(shiftId, update);
  });
}

/**
 * Admin-only permanent removal of a shift record. Orders/expenses already
 * logged against it are left untouched (they keep their historical
 * shiftId) — only the Shift record itself is removed.
 */
export async function adminDeleteShift(shiftId: string): Promise<void> {
  await db.shifts.delete(shiftId);
}
