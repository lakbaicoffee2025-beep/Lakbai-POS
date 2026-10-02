import { format } from "date-fns";
import { db } from "./db";
import { newId } from "../lib/id";
import { pushTables } from "./remoteSync";

/** Category tag used to distinguish a Paid Out from any other expense row. */
export const PAID_OUT_CATEGORY = "Paid Out";

/**
 * Records cash taken out of the till mid-shift (e.g. a quick supply run
 * paid straight from the drawer) — a lighter-weight alternative to the
 * cash-envelope Expense Report, scoped to the active shift. Stored as a
 * plain Expense row (category "Paid Out", paymentMethod "cash") so it
 * automatically reduces this shift's expected cash-in-drawer via the
 * existing computeShiftSummary math — no separate calculation needed.
 */
export async function recordPaidOut(
  shiftId: string,
  description: string,
  amount: number,
  userId: string,
  userName: string
): Promise<void> {
  await db.expenses.add({
    id: newId(),
    date: format(new Date(), "yyyy-MM-dd"),
    shiftId,
    category: PAID_OUT_CATEGORY,
    description,
    amount,
    paymentMethod: "cash",
    recordedBy: userId,
    recordedByName: userName,
    createdAt: Date.now(),
  });
  // Push immediately rather than waiting on the usual debounce — see the
  // same reasoning in saveExpenseReport (src/db/expenseReports.ts): this is
  // routinely filed from a Messenger-shared link's in-app browser, which
  // can tear its tab down well inside that debounce window.
  pushTables(["expenses"]);
}
