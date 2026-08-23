import { db } from "./db";

/**
 * Permanently removes an order/receipt from history. Admin-only; enforced
 * by the caller. Unlike void or refund, this never touches ingredient
 * stock — only Void and Refund restore inventory. Deleting a "completed"
 * order that was never voided/refunded leaves whatever it deducted as-is;
 * use Void first if the stock also needs to come back.
 */
export async function deleteOrder(orderId: string): Promise<void> {
  await db.orders.delete(orderId);
}
