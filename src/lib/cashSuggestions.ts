// Common Philippine peso bill/coin denominations, used to round the amount
// due up to a value a cashier would actually be handed — "round up to the
// nearest ₱X" rather than an arbitrary mathematical rounding.
const DENOMINATIONS = [20, 50, 100, 200, 500, 1000, 2000, 5000];

/**
 * Suggested cash-tendered amounts for a checkout: the exact amount due,
 * plus the next few distinct round-bill amounts above it — e.g. for
 * ₱637.00 due: [637, 650, 700, 1000]. Always returns 4 values, ascending,
 * starting with the exact amount.
 */
export function suggestedCashAmounts(due: number): number[] {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const exact = round2(Math.max(0, due));

  const above = new Set<number>();
  for (const denom of DENOMINATIONS) {
    const upped = round2(Math.ceil(exact / denom) * denom);
    if (upped > exact + 0.004) above.add(upped);
  }

  const sortedAbove = Array.from(above).sort((a, b) => a - b).slice(0, 3);
  return [exact, ...sortedAbove];
}
