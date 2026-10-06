import { db } from "./db";
import { newId } from "../lib/id";
import { cartLineIngredientUsage } from "./inventory";
import { refundedQtyForLine, refundableQty } from "../lib/refundMath";
import type { OrderRefund } from "../types";

export { refundedQtyForLine, refundableQty, orderRefundedTotal, orderRefundedCashGcash } from "../lib/refundMath";

/**
 * Refunds some or all of the quantity on one order line: logs a refund
 * record and replenishes exactly the ingredients that quantity would
 * consume, using the product's current recipe (the same computation used
 * at checkout — there's no historical recipe snapshot per line, so a
 * recipe changed since the sale will refund at today's recipe, same
 * caveat as any other stock-restoring action in this app). Items flagged
 * Track Stock = off never deducted, so they never replenish either.
 *
 * Cashier and Admin both allowed — enforced by the caller, the UI never
 * renders this for Stockman.
 */
export async function refundOrderItem(
  orderId: string,
  lineId: string,
  qty: number,
  reason: string,
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
      if (order.status !== "completed") {
        throw new Error("Only completed orders can be refunded");
      }
      const line = order.items.find((l) => l.id === lineId);
      if (!line) throw new Error("Item not found on this order");

      const remaining = refundableQty(order, lineId);
      if (qty <= 0 || qty > remaining) {
        throw new Error(`Can only refund up to ${remaining} of this item`);
      }

      const product = await db.products.get(line.productId);
      if (product && product.trackStock !== false) {
        const allModifierGroups = await db.modifierGroups.toArray();
        const optionRecipeById = new Map(
          allModifierGroups.flatMap((g) => g.options.map((o) => [o.id, o.recipe]))
        );
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
          const restoreQty = perUnitQty * qty;
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
            note: `Refund reversal for Order #${order.orderNo} — ${line.productName}`,
            createdBy: userId,
            createdByName: userName,
            createdAt: Date.now(),
          });
        }
      }

      const unitPrice = line.lineTotal / line.qty;
      const refund: OrderRefund = {
        id: newId(),
        lineId,
        productName: line.productName + (line.variantName ? ` (${line.variantName})` : ""),
        qty,
        amount: unitPrice * qty,
        reason,
        refundedBy: userId,
        refundedByName: userName,
        refundedAt: Date.now(),
      };

      const refunds = [...(order.refunds ?? []), refund];
      const fullyRefunded = order.items.every(
        (l) => refundedQtyForLine({ refunds }, l.id) >= l.qty
      );

      await db.orders.update(orderId, {
        refunds,
        status: fullyRefunded ? "refunded" : order.status,
      });
    }
  );
}
