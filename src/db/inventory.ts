import { db } from "./db";
import { newId } from "../lib/id";
import type {
  CartLine,
  RecipeItem,
  InventoryMovementType,
  PurchaseOrder,
} from "../types";

function combineRecipes(lines: RecipeItem[][]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const recipe of lines) {
    for (const item of recipe) {
      totals.set(item.ingredientId, (totals.get(item.ingredientId) ?? 0) + item.qty);
    }
  }
  return totals;
}

/** Compute total ingredient consumption for a single cart line (qty-adjusted). */
export function cartLineIngredientUsage(
  line: CartLine,
  productRecipe: RecipeItem[],
  variantRecipe: RecipeItem[],
  modifierRecipes: RecipeItem[][]
): Map<string, number> {
  const perUnit = combineRecipes([productRecipe, variantRecipe, ...modifierRecipes]);
  const totals = new Map<string, number>();
  for (const [ingredientId, qty] of perUnit) {
    totals.set(ingredientId, qty * line.qty);
  }
  return totals;
}

/**
 * Deduct ingredient stock for a completed sale and log inventory movements.
 * `usageByIngredient` maps ingredientId -> total quantity consumed across the whole order.
 */
export async function deductInventoryForOrder(
  usageByIngredient: Map<string, number>,
  orderId: string,
  cashierId: string,
  cashierName: string
): Promise<void> {
  await db.transaction(
    "rw",
    db.ingredients,
    db.inventoryMovements,
    async () => {
      for (const [ingredientId, qty] of usageByIngredient) {
        if (qty <= 0) continue;
        const ingredient = await db.ingredients.get(ingredientId);
        if (!ingredient) continue;
        const newQty = ingredient.stockQty - qty;
        await db.ingredients.update(ingredientId, {
          stockQty: newQty,
          updatedAt: Date.now(),
        });
        await db.inventoryMovements.add({
          id: newId(),
          ingredientId,
          ingredientName: ingredient.name,
          type: "sale",
          qty: -qty,
          refType: "order",
          refId: orderId,
          createdBy: cashierId,
          createdByName: cashierName,
          createdAt: Date.now(),
        });
      }
    }
  );
}

export async function adjustIngredientStock(
  ingredientId: string,
  qtyDelta: number,
  type: InventoryMovementType,
  userId: string,
  userName: string,
  note?: string,
  extra?: { reason?: string; photoDataUrl?: string }
): Promise<void> {
  await db.transaction(
    "rw",
    db.ingredients,
    db.inventoryMovements,
    async () => {
      const ingredient = await db.ingredients.get(ingredientId);
      if (!ingredient) throw new Error("Ingredient not found");
      const newQty = ingredient.stockQty + qtyDelta;
      await db.ingredients.update(ingredientId, {
        stockQty: newQty,
        updatedAt: Date.now(),
      });
      await db.inventoryMovements.add({
        id: newId(),
        ingredientId,
        ingredientName: ingredient.name,
        type,
        qty: qtyDelta,
        refType: "manual",
        note,
        reason: extra?.reason,
        photoDataUrl: extra?.photoDataUrl,
        createdBy: userId,
        createdByName: userName,
        createdAt: Date.now(),
      });
    }
  );
}

/**
 * Quick bulk stock-in across multiple ingredients at once — for restocking
 * that didn't go through a formal Purchase Order (e.g. a walk-in supply
 * run). Adds the given quantities and logs one "adjustment_in" movement per
 * ingredient.
 */
export async function bulkRestock(
  entries: { ingredientId: string; qty: number }[],
  userId: string,
  userName: string,
  note?: string
): Promise<void> {
  await db.transaction("rw", db.ingredients, db.inventoryMovements, async () => {
    for (const { ingredientId, qty } of entries) {
      if (qty <= 0) continue;
      const ingredient = await db.ingredients.get(ingredientId);
      if (!ingredient) continue;
      await db.ingredients.update(ingredientId, {
        stockQty: ingredient.stockQty + qty,
        updatedAt: Date.now(),
      });
      await db.inventoryMovements.add({
        id: newId(),
        ingredientId,
        ingredientName: ingredient.name,
        type: "adjustment_in",
        qty,
        refType: "manual",
        note: note || "Restock",
        createdBy: userId,
        createdByName: userName,
        createdAt: Date.now(),
      });
    }
  });
}

/** Receive (fully or partially) a purchase order: adds stock and logs movements. */
export async function receivePurchaseOrder(
  po: PurchaseOrder,
  receivedQtyByIngredient: Map<string, number>,
  userId: string,
  userName: string
): Promise<void> {
  await db.transaction(
    "rw",
    db.ingredients,
    db.inventoryMovements,
    db.purchaseOrders,
    async () => {
      const updatedItems = po.items.map((item) => {
        const receivedNow = receivedQtyByIngredient.get(item.ingredientId) ?? 0;
        return {
          ...item,
          qtyReceived: item.qtyReceived + receivedNow,
        };
      });

      for (const [ingredientId, qty] of receivedQtyByIngredient) {
        if (qty <= 0) continue;
        const ingredient = await db.ingredients.get(ingredientId);
        if (!ingredient) continue;
        await db.ingredients.update(ingredientId, {
          stockQty: ingredient.stockQty + qty,
          updatedAt: Date.now(),
        });
        await db.inventoryMovements.add({
          id: newId(),
          ingredientId,
          ingredientName: ingredient.name,
          type: "purchase_receive",
          qty,
          refType: "purchase_order",
          refId: po.id,
          createdBy: userId,
          createdByName: userName,
          createdAt: Date.now(),
        });
      }

      const fullyReceived = updatedItems.every(
        (item) => item.qtyReceived >= item.qtyOrdered
      );
      const anyReceived = updatedItems.some((item) => item.qtyReceived > 0);

      await db.purchaseOrders.update(po.id, {
        items: updatedItems,
        status: fullyReceived
          ? "received"
          : anyReceived
            ? "partially_received"
            : po.status,
        receivedAt: fullyReceived ? Date.now() : po.receivedAt,
      });
    }
  );
}
