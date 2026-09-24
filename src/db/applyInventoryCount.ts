import { db } from "./db";
import { newId } from "../lib/id";
import type { InventoryCount, InventoryCountLine, InventoryCountType } from "../types";

function countTypeLabel(type: InventoryCountType): string {
  if (type === "opening") return "Beginning";
  if (type === "closing") return "Ending";
  return "Actual";
}

/**
 * The reason flagged on each reconciling movement, so a discrepancy between
 * what the ending count found and what the system expected — and an
 * admin-run Actual Count overriding everything to a new authoritative
 * figure — both stand out distinctly in the Movement Log.
 */
function countReason(type: InventoryCountType): string {
  if (type === "actual") return "Actual Count (Final)";
  return `${countTypeLabel(type)} Count Discrepancy`;
}

/**
 * Records an inventory count — daily opening/closing, or an admin-run
 * actual/physical count taken any time.
 *
 * Only an Actual Count (admin-only, a real physical stock-take) is treated
 * as authoritative and actually reconciles the live stock figure, logging
 * a normal inventory movement for the adjustment. Opening/closing counts —
 * routine, staff-taken, and much more prone to a scale/decimal/miscount
 * error — are always recorded (with their variance) for the reconciliation
 * report in the Movement Log, but never silently overwrite the
 * sales-driven running stock: a bad closing count used to reset that
 * number for every subsequent screen (out-of-stock flags, valuation,
 * reorder alerts) until someone happened to notice and re-adjust it. An
 * admin still sees every discrepancy either way and can act on it with an
 * Actual Count when it's confirmed real.
 */
export async function submitInventoryCount(
  type: InventoryCountType,
  date: string,
  countedByIngredientId: Map<string, number>,
  userId: string,
  userName: string,
  notes?: string
): Promise<InventoryCount> {
  const isAuthoritative = type === "actual";
  return db.transaction(
    "rw",
    [db.ingredients, db.inventoryMovements, db.inventoryCounts],
    async () => {
      const lines: InventoryCountLine[] = [];

      for (const [ingredientId, countedQty] of countedByIngredientId) {
        const ingredient = await db.ingredients.get(ingredientId);
        if (!ingredient) continue;
        const systemQty = ingredient.stockQty;
        const variance = countedQty - systemQty;

        lines.push({
          ingredientId,
          ingredientName: ingredient.name,
          unit: ingredient.unit,
          systemQty,
          countedQty,
          variance,
        });

        if (Math.abs(variance) < 1e-9 || !isAuthoritative) continue;

        await db.ingredients.update(ingredientId, {
          stockQty: countedQty,
          updatedAt: Date.now(),
        });
        await db.inventoryMovements.add({
          id: newId(),
          ingredientId,
          ingredientName: ingredient.name,
          type: variance > 0 ? "adjustment_in" : "adjustment_out",
          qty: variance,
          refType: "manual",
          note: `${countTypeLabel(type)} count for ${date}${notes ? ` — ${notes}` : ""}`,
          reason: countReason(type),
          createdBy: userId,
          createdByName: userName,
          createdAt: Date.now(),
        });
      }

      const record: InventoryCount = {
        id: newId(),
        type,
        date,
        lines,
        notes,
        recordedBy: userId,
        recordedByName: userName,
        createdAt: Date.now(),
      };
      await db.inventoryCounts.add(record);
      return record;
    }
  );
}
