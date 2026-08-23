import { db } from "./db";
import { newId } from "../lib/id";
import { cartLineIngredientUsage } from "./inventory";
import { refundableQty } from "../lib/refundMath";

/**
 * Permanently removes an order/receipt from history. Admin-only; enforced
 * by the caller. Unlike void (which keeps the record and flags it), this
 * erases it entirely — so for a "completed" order still holding deducted
 * stock, it first restores whatever quantity hasn't already been reversed
 * by a prior refund (using the current recipe, same caveat as refund/void).
 * A "voided" order already had its stock restored, and a fully "refunded"
 * order already had all of its stock restored — both delete cleanly with
 * no further stock changes.
 */
export async function deleteOrder(
  orderId: string,
  userId: string,
  userName: string
): Promise<void> {
  await db.transaction(
    "rw",
    db.orders,
    db.products,
    db.modifierGroups,
    db.ingredients,
    db.inventoryMovements,
    async () => {
      const order = await db.orders.get(orderId);
      if (!order) throw new Error("Order not found");

      if (order.status === "completed") {
        const allModifierGroups = await db.modifierGroups.toArray();
        const optionRecipeById = new Map(
          allModifierGroups.flatMap((g) => g.options.map((o) => [o.id, o.recipe]))
        );

        for (const line of order.items) {
          const remaining = refundableQty(order, line.id);
          if (remaining <= 0) continue;
          const product = await db.products.get(line.productId);
          if (!product || product.trackStock === false) continue;

          const variant = product.variants.find((v) => v.id === line.variantId);
          const modifierRecipes = line.modifiers.map(
            (m) => optionRecipeById.get(m.optionId) ?? []
          );
          const perUnitUsage = cartLineIngredientUsage(
            { ...line, qty: 1 },
            product.recipe,
            variant?.recipe ?? [],
            modifierRecipes
          );

          for (const [ingredientId, perUnitQty] of perUnitUsage) {
            const restoreQty = perUnitQty * remaining;
            if (restoreQty <= 0) continue;
            const ingredient = await db.ingredients.get(ingredientId);
            if (!ingredient) continue;
            await db.ingredients.update(ingredientId, {
              stockQty: ingredient.stockQty + restoreQty,
              updatedAt: Date.now(),
            });
            await db.inventoryMovements.add({
              id: newId(),
              ingredientId,
              ingredientName: ingredient.name,
              type: "adjustment_in",
              qty: restoreQty,
              refType: "order",
              refId: orderId,
              note: `Deleted receipt reversal for Order #${order.orderNo} — ${line.productName}`,
              createdBy: userId,
              createdByName: userName,
              createdAt: Date.now(),
            });
          }
        }
      }

      await db.orders.delete(orderId);
    }
  );
}
