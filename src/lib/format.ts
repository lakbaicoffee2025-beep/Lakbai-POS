export function formatMoney(amount: number, symbol = "₱"): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${symbol}${Math.abs(amount).toFixed(2)}`;
}
