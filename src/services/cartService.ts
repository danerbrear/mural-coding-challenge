import { v4 as uuidv4 } from "uuid";
import * as db from "./dynamodb";
import type { Cart, CartItem } from "../models/types";

export async function createCart(items: CartItem[]): Promise<Cart> {
  const now = new Date().toISOString();
  const cart: Cart = {
    id: uuidv4(),
    items,
    createdAt: now,
    updatedAt: now,
  };
  await db.putItem("carts", cart);
  return cart;
}

export async function getCart(cartId: string): Promise<Cart | null> {
  return db.getItem<Cart>("carts", { id: cartId });
}

export async function listCarts(limit = 20, nextToken?: string): Promise<{ items: Cart[]; nextToken?: string }> {
  return db.scan<Cart>("carts", { limit, nextToken });
}
