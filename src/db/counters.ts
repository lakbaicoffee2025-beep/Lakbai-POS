import { db } from "./db";

export async function nextOrderNo(): Promise<number> {
  const last = await db.orders.orderBy("orderNo").last();
  return (last?.orderNo ?? 0) + 1;
}

export async function nextPoNo(): Promise<number> {
  const last = await db.purchaseOrders.orderBy("poNo").last();
  return (last?.poNo ?? 0) + 1;
}
