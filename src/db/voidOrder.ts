import { db } from "./db";
import { newId } from "../lib/id";

/**
 * Voids a completed order and reverses exactly the stock it deducted, by
 * replaying its own logged "sale" movements in reverse — not by
 * recomputing recipes from current product state, which may have changed
 * since the sale. Admin-only; enforced by the caller (UI never renders
 * this action for a cashier).
 */
export async function voidOrder(
  orderId: string,
  reason: string,
  userId: string,
  userName: string
): Promise<void> {
  await db.transaction(
    "rw",
    db.orders,
    db.ingredients,
    db.inventoryMovements,
    async () => {
      const order = await db.orders.get(orderId);
      if (!order) throw new Error("Order not found");
      if (order.status !== "completed") {
        throw new Error("Only completed orders can be voided");
      }

      const saleMovements = await db.inventoryMovements
        .where("refId")
        .equals(orderId)
        .and((m) => m.type === "sale")
        .toArray();

      for (const m of saleMovements) {
        const ingredient = await db.ingredients.get(m.ingredientId);
        if (!ingredient) continue;
        const restored = -m.qty; // sale movements are logged negative
        await db.ingredients.update(ingredient.id, {
          stockQty: ingredient.stockQty + restored,
          updatedAt: Date.now(),
        });
        await db.inventoryMovements.add({
          id: newId(),
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          type: "adjustment_in",
          qty: restored,
          refType: "order",
          refId: orderId,
          note: `Void reversal for Order #${order.orderNo}`,
          createdBy: userId,
          createdByName: userName,
          createdAt: Date.now(),
        });
      }

      await db.orders.update(orderId, {
        status: "voided",
        voidedAt: Date.now(),
        voidedBy: userId,
        voidedByName: userName,
        voidReason: reason,
      });
    }
  );
}
