import { db } from "./db";
import { computeShiftSummary } from "../lib/shiftMath";
import { pushTables } from "./remoteSync";

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

export interface ShiftForceCloseInput {
  startingCash: number;
  countedCash: number;
  countedGcash: number;
  notes?: string;
}

/**
 * Admin override to close a shift that's stuck open on its own device —
 * most commonly because its cashier closed it there, but a stale sync push
 * from another device reverted it back to "open" before the fix in
 * remoteSync.ts (a shift close is now a one-way transition that always
 * wins a merge), or because the cashier simply left for the day without
 * ever hitting Close Shift. Left open, every new sale rung up afterward —
 * including on a later day — keeps posting against this same old shift
 * instead of a new one, since the app only prompts to open a new shift when
 * it finds no shift already "active". Computes expected cash/GCash the same
 * way the normal close flow does, from this shift's actual orders and
 * expenses, so the admin only has to enter what was actually counted.
 */
export async function adminForceCloseShift(
  shiftId: string,
  input: ShiftForceCloseInput
): Promise<void> {
  await db.transaction("rw", db.shifts, db.orders, db.expenses, async () => {
    const shift = await db.shifts.get(shiftId);
    if (!shift) throw new Error("Shift not found");
    if (shift.status === "closed") return;

    const merged = { ...shift, startingCash: input.startingCash };
    const [orders, expenses] = await Promise.all([
      db.orders.where("shiftId").equals(shiftId).toArray(),
      db.expenses.where("shiftId").equals(shiftId).toArray(),
    ]);
    const summary = computeShiftSummary(merged, orders, expenses);

    await db.shifts.update(shiftId, {
      startingCash: input.startingCash,
      status: "closed",
      endedAt: Date.now(),
      countedCash: input.countedCash,
      countedGcash: input.countedGcash,
      expectedCash: summary.expectedCash,
      expectedGcash: summary.expectedGcash,
      cashVariance: input.countedCash - summary.expectedCash,
      gcashVariance: input.countedGcash - summary.expectedGcash,
      notes: input.notes,
    });
  });
  // Push immediately — the whole point of this override is to get this
  // shift's closed status onto the server and out to every other device as
  // fast as possible.
  pushTables(["shifts"]);
}
