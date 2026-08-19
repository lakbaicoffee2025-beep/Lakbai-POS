import { db } from "./db";
import { newId } from "../lib/id";
import type { InventoryCount, InventoryCountLine, InventoryCountType } from "../types";

/**
 * Records a daily opening/closing inventory count and reconciles actual
 * stock to whatever was physically counted (skipping ingredients whose
 * count matches the system already). Each reconciling adjustment is logged
 * as a normal inventory movement, same as a manual stock adjustment.
 */
export async function submitInventoryCount(
  type: InventoryCountType,
  date: string,
  countedByIngredientId: Map<string, number>,
  userId: string,
  userName: string,
  notes?: string
): Promise<InventoryCount> {
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

        if (Math.abs(variance) < 1e-9) continue;

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
          note: `${type === "opening" ? "Opening" : "Closing"} count for ${date}`,
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
