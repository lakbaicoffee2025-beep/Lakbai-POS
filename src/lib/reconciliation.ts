import type { Ingredient, InventoryCount, InventoryMovement } from "../types";

export interface ReconciliationRow {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  /** Beginning-of-day figure to reconcile against — this day's Beginning
   *  count if one was taken, otherwise the most recent count from an
   *  earlier day. Null if no count has ever been recorded for it. */
  startingStock: number | null;
  sold: number;
  restocked: number;
  wasted: number;
  /** startingStock - sold. Null when there's no startingStock to work from. */
  expected: number | null;
  /** This day's Ending (or Actual, if that's what was taken) count. */
  actualCounted: number | null;
  /** actualCounted - expected. Null unless both sides are known. */
  discrepancy: number | null;
}

/**
 * Picks the count line for one ingredient out of a count record, if present.
 */
function lineFor(count: InventoryCount, ingredientId: string) {
  return count.lines.find((l) => l.ingredientId === ingredientId);
}

/**
 * The stock figure to treat as "the start of this day" for one ingredient:
 * this day's own Beginning count if the stockman took one, otherwise
 * whatever was counted most recently on an earlier day (any count type —
 * better than nothing when no Beginning count was logged). `countsByDate`
 * must be sorted ascending by date already.
 */
function startingStockFor(
  ingredientId: string,
  dateStr: string,
  countsAscending: InventoryCount[]
): number | null {
  const sameDayOpening = countsAscending.find(
    (c) => c.date === dateStr && c.type === "opening" && lineFor(c, ingredientId)
  );
  if (sameDayOpening) return lineFor(sameDayOpening, ingredientId)!.countedQty;

  for (let i = countsAscending.length - 1; i >= 0; i--) {
    const c = countsAscending[i];
    if (c.date >= dateStr) continue;
    const line = lineFor(c, ingredientId);
    if (line) return line.countedQty;
  }
  return null;
}

/**
 * This day's authoritative closing figure for one ingredient: an Actual
 * (physical stock-take) count takes priority if one was run that day since
 * it's explicitly treated elsewhere as final/authoritative; otherwise the
 * day's Ending count.
 */
function actualCountedFor(ingredientId: string, sameDayCounts: InventoryCount[]): number | null {
  const actual = sameDayCounts.find((c) => c.type === "actual" && lineFor(c, ingredientId));
  if (actual) return lineFor(actual, ingredientId)!.countedQty;
  const closing = sameDayCounts.find((c) => c.type === "closing" && lineFor(c, ingredientId));
  if (closing) return lineFor(closing, ingredientId)!.countedQty;
  return null;
}

/**
 * Per-ingredient reconciliation for one calendar day: starting stock minus
 * that day's sales gives the expected figure, compared against whatever the
 * stockman physically counted that day, to surface unexplained shrinkage.
 * Restocked/wasted quantities are carried along only as context (they're
 * not netted into "expected") so a discrepancy that lines up with logged
 * waste is easy to tell apart from one that doesn't.
 *
 * `allCounts` should be every InventoryCount on record (any date); `dayMovements`
 * should already be filtered to just this calendar day.
 */
export function computeDailyReconciliation(
  dateStr: string,
  ingredients: Ingredient[],
  allCounts: InventoryCount[],
  dayMovements: InventoryMovement[]
): ReconciliationRow[] {
  const countsAscending = [...allCounts].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt
  );
  const sameDayCounts = allCounts.filter((c) => c.date === dateStr);

  const movementsByIngredient = new Map<string, InventoryMovement[]>();
  for (const m of dayMovements) {
    const list = movementsByIngredient.get(m.ingredientId);
    if (list) list.push(m);
    else movementsByIngredient.set(m.ingredientId, [m]);
  }

  return ingredients.map((ing) => {
    const movements = movementsByIngredient.get(ing.id) ?? [];
    const sold = movements
      .filter((m) => m.type === "sale")
      .reduce((s, m) => s + Math.abs(m.qty), 0);
    const restocked = movements
      .filter((m) => m.type === "adjustment_in" || m.type === "purchase_receive")
      .reduce((s, m) => s + Math.abs(m.qty), 0);
    const wasted = movements
      .filter((m) => m.type === "waste")
      .reduce((s, m) => s + Math.abs(m.qty), 0);

    const startingStock = startingStockFor(ing.id, dateStr, countsAscending);
    const expected = startingStock === null ? null : startingStock - sold;
    const actualCounted = actualCountedFor(ing.id, sameDayCounts);
    const discrepancy =
      expected === null || actualCounted === null ? null : actualCounted - expected;

    return {
      ingredientId: ing.id,
      ingredientName: ing.name,
      unit: ing.unit,
      startingStock,
      sold,
      restocked,
      wasted,
      expected,
      actualCounted,
      discrepancy,
    };
  });
}
