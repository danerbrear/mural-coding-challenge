import { v4 as uuidv4 } from "uuid";
import * as db from "./dynamodb";
import type { Product } from "../models/types";

const DEFAULT_PRODUCTS: Omit<Product, "id" | "createdAt">[] = [
  { name: "Product A", description: "Sample product A", priceUsdc: 10 },
  { name: "Product B", description: "Sample product B", priceUsdc: 25.5 },
  { name: "Product C", description: "Sample product C", priceUsdc: 50 },
];

export async function ensureDefaultProducts(): Promise<void> {
  const { items } = await db.scan<Product>("products", { limit: 1 });
  if (items.length > 0) return;
  const now = new Date().toISOString();
  for (const p of DEFAULT_PRODUCTS) {
    await db.putItem("products", {
      id: uuidv4(),
      name: p.name,
      description: p.description,
      priceUsdc: p.priceUsdc,
      createdAt: now,
    });
  }
}

export async function listProducts(limit = 20, nextToken?: string): Promise<{ items: Product[]; nextToken?: string }> {
  return db.scan<Product>("products", { limit, nextToken });
}

export async function getProduct(id: string): Promise<Product | null> {
  return db.getItem<Product>("products", { id });
}
