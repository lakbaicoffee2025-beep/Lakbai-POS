import type { ExpenseLineItem } from "../types";

export interface ExpenseTotals {
  amountReceived: number;
  totalExpenses: number;
  remainingCash: number;
}

export function computeExpenseTotals(
  cashReceived: number,
  atmWithdrawal: number,
  items: ExpenseLineItem[]
): ExpenseTotals {
  const amountReceived = cashReceived + atmWithdrawal;
  const totalExpenses = items.reduce((s, i) => s + (i.amount || 0), 0);
  return {
    amountReceived,
    totalExpenses,
    remainingCash: amountReceived - totalExpenses,
  };
}
