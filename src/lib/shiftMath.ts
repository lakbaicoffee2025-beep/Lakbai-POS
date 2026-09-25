import type { Expense, Order, Shift } from "../types";
import { orderRefundedTotal, orderRefundedCashGcash } from "./refundMath";

export interface ShiftSummary {
  orderCount: number;
  grossSales: number;
  discountTotal: number;
  taxTotal: number;
  netSales: number;
  cashSales: number;
  gcashSales: number;
  cashExpenses: number;
  gcashExpenses: number;
  expectedCash: number;
  expectedGcash: number;
}

export function computeShiftSummary(
  shift: Shift,
  orders: Order[],
  expenses: Expense[]
): ShiftSummary {
  // A fully refunded order flips to status "refunded" and drops out here
  // entirely; a partially refunded one stays "completed" but nets out the
  // refunded amount below, assumed paid back via the same cash/GCash mix
  // as the original sale (there's no separate "how was this refunded" step).
  const completed = orders.filter((o) => o.status === "completed");
  const grossSales = completed.reduce((s, o) => s + o.subtotal, 0);
  const discountTotal = completed.reduce((s, o) => s + o.discountTotal, 0);
  const taxTotal = completed.reduce((s, o) => s + o.taxTotal, 0);
  const netSales = completed.reduce((s, o) => s + o.total - orderRefundedTotal(o), 0);
  const cashSales = completed.reduce(
    (s, o) => s + o.payment.cashAmount - orderRefundedCashGcash(o).cash,
    0
  );
  const gcashSales = completed.reduce(
    (s, o) => s + o.payment.gcashAmount - orderRefundedCashGcash(o).gcash,
    0
  );
  const cashExpenses = expenses
    .filter((e) => e.paymentMethod === "cash" || e.paymentMethod === "split")
    .reduce((s, e) => s + e.amount, 0);
  const gcashExpenses = expenses
    .filter((e) => e.paymentMethod === "gcash")
    .reduce((s, e) => s + e.amount, 0);

  return {
    orderCount: completed.length,
    grossSales,
    discountTotal,
    taxTotal,
    netSales,
    cashSales,
    gcashSales,
    cashExpenses,
    gcashExpenses,
    expectedCash: shift.startingCash + cashSales - cashExpenses,
    expectedGcash: gcashSales - gcashExpenses,
  };
}
