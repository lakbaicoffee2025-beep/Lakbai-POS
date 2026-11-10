import type { OrderRefund } from "../types";

/** How many units of this line have been refunded so far. */
export function refundedQtyForLine(order: { refunds?: OrderRefund[] }, lineId: string): number {
  return (order.refunds ?? [])
    .filter((r) => r.lineId === lineId)
    .reduce((s, r) => s + r.qty, 0);
}

/** How many units of this line have not yet been refunded. */
export function refundableQty(
  order: { items: { id: string; qty: number }[]; refunds?: OrderRefund[] },
  lineId: string
): number {
  const line = order.items.find((l) => l.id === lineId);
  if (!line) return 0;
  return line.qty - refundedQtyForLine(order, lineId);
}

/** Total money refunded across every line of this order so far. */
export function orderRefundedTotal(order: { refunds?: OrderRefund[] }): number {
  return (order.refunds ?? []).reduce((s, r) => s + r.amount, 0);
}

/**
 * Splits an order's total refunded amount across cash/GCash proportionally
 * to how the original sale was paid — there's no separate "how was this
 * refund paid out" step, it's assumed to mirror the original tender. Used
 * to keep revenue and shift cash-in-drawer figures accurate after a
 * partial refund (a fully refunded order is simply excluded — its status
 * flips to "refunded").
 */
export function orderRefundedCashGcash(order: {
  total: number;
  payment: { cashAmount: number; gcashAmount: number };
  refunds?: OrderRefund[];
}): { cash: number; gcash: number } {
  const refunded = orderRefundedTotal(order);
  if (refunded <= 0 || order.total <= 0) return { cash: 0, gcash: 0 };
  const cashShare = order.payment.cashAmount / order.total;
  return { cash: refunded * cashShare, gcash: refunded * (1 - cashShare) };
}
