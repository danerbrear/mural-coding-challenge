import { apiController, GET, POST, pathParam, queryParam, body, response } from "ts-lambda-api";
import * as cartService from "../services/cartService";
import type { Cart, CartItem } from "../models/types";

function baseUrl(res: { get?: (name: string) => string } | undefined): string {
  if (!res?.get) return "";
  const host = res.get("host") ?? "localhost";
  const proto = res.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

@apiController("carts")
export class CartsController {
  @POST()
  public async create(@body body: { items: CartItem[]; idempotencyKey?: string }, @response res?: { get?: (name: string) => string }) {
    const items = body?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, message: "items array is required and must not be empty" };
    }
    const cart = await cartService.createCart(items);
    const b = res ? baseUrl(res) : "";
    return {
      _links: {
        self: { href: `${b}/carts/${cart.id}`, rel: "self" },
        collection: { href: `${b}/carts`, rel: "collection" },
      },
      ...cart,
    };
  }

  @GET()
  public async list(
    @queryParam("limit") limit?: string,
    @queryParam("nextToken") nextToken?: string,
    @response res?: { get?: (name: string) => string }
  ) {
    const limitNum = Math.min(Math.max(parseInt(limit ?? "20", 10) || 20, 1), 100);
    const { items, nextToken: next } = await cartService.listCarts(limitNum, nextToken);
    const b = res ? baseUrl(res) : "";
    const data = items.map((c) => ({
      ...c,
      _links: {
        self: { href: `${b}/carts/${c.id}`, rel: "self" },
      },
    }));
    return {
      _links: { self: { href: `${b}/carts`, rel: "self" } },
      _embedded: { items: data },
      items: data,
      nextToken: next,
    };
  }

  @GET("/:cartId")
  public async get(@pathParam("cartId") cartId: string, @response res?: { get?: (name: string) => string }) {
    const cart = await cartService.getCart(cartId);
    if (!cart) return { statusCode: 404, message: "Cart not found" };
    const b = res ? baseUrl(res) : "";
    return {
      _links: {
        self: { href: `${b}/carts/${cart.id}`, rel: "self" },
        collection: { href: `${b}/carts`, rel: "collection" },
      },
      ...cart,
    };
  }
}
