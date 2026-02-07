import * as db from "./dynamodb";
import type { Order, OrderStatus } from "../models/types";

export async function createOrder(order: Order): Promise<void> {
  await db.putItem("orders", order);
}

export async function getOrder(orderId: string): Promise<Order | null> {
  return db.getItem<Order>("orders", { id: orderId });
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, extra?: Partial<Order>): Promise<Order | null> {
  const key = { id: orderId };
  const updates: Record<string, unknown> = { status, updatedAt: new Date().toISOString() };
  if (extra) Object.assign(updates, extra);
  const out = await db.updateItem("orders", key, updates);
  return out as unknown as Order;
}

export async function listOrdersByStatus(status: string, limit = 20, nextToken?: string): Promise<{ items: Order[]; nextToken?: string }> {
  return db.query<Order>(
    "orders",
    "#s = :s",
    { "#s": "status" },
    { ":s": status },
    { limit, nextToken, indexName: "status-created-index" }
  );
}

export async function listAllOrders(limit = 20, nextToken?: string): Promise<{ items: Order[]; nextToken?: string }> {
  return db.scan<Order>("orders", { limit, nextToken });
}
