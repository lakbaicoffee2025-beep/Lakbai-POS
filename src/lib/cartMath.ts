import type { CartLine, DiscountType } from "../types";

export interface OrderTotals {
  subtotal: number;
  discountTotal: number;
  netBeforeTax: number;
  taxTotal: number;
  total: number;
}

export function computeOrderTotals(
  lines: CartLine[],
  orderDiscount: { type: DiscountType; value: number } | null,
  taxRate: number,
  taxInclusive: boolean
): OrderTotals {
  const subtotal = lines.reduce((sum, l) => {
    const modTotal = l.modifiers.reduce((s, m) => s + m.priceDelta, 0);
    return sum + (l.unitPrice + modTotal) * l.qty;
  }, 0);

  let lineDiscounts = 0;
  for (const l of lines) {
    const modTotal = l.modifiers.reduce((s, m) => s + m.priceDelta, 0);
    const gross = (l.unitPrice + modTotal) * l.qty;
    lineDiscounts += gross - l.lineTotal;
  }

  let discountTotal = lineDiscounts;
  const afterLineDiscounts = subtotal - lineDiscounts;
  if (orderDiscount) {
    discountTotal +=
      orderDiscount.type === "percent"
        ? afterLineDiscounts * (orderDiscount.value / 100)
        : Math.min(orderDiscount.value, afterLineDiscounts);
  }

  const netBeforeTax = subtotal - discountTotal;
  const taxTotal = taxInclusive
    ? netBeforeTax - netBeforeTax / (1 + taxRate / 100)
    : netBeforeTax * (taxRate / 100);
  const total = taxInclusive ? netBeforeTax : netBeforeTax + taxTotal;

  return { subtotal, discountTotal, netBeforeTax, taxTotal, total };
}
