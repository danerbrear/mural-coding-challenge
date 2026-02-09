import { injectable } from "inversify";
import { apiController, apiOperation, apiRequest, apiResponse, GET, POST, pathParam, queryParam, body, response } from "ts-lambda-api";
import * as cartService from "../services/cartService";
import { InvalidNextTokenError } from "../services/dynamodb";
import { CreateCartRequest } from "../models/requestDtos";
import type { Cart, CartItem } from "../models/types";
import { paginationLinks } from "../utils/paginationLinks";

function baseUrl(res: { get?: (name: string) => string } | undefined): string {
  if (!res?.get) return "";
  const host = res.get("host") ?? "localhost";
  const proto = res.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

@apiController("carts")
@injectable()
export class CartsController {
  @POST()
  @apiOperation({ name: "Create cart", description: "Create cart (idempotent with idempotencyKey in body)" })
  @apiRequest({ class: CreateCartRequest })
  @apiResponse(200, { type: "object", description: "Created cart with _links" })
  @apiResponse(400, { type: "object", description: "Bad request" })
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
  @apiOperation({ name: "List carts", description: "Paginated list of carts with _links" })
  @apiResponse(200, { type: "object", description: "Paginated list of carts with _links" })
  @apiResponse(400, { type: "object", description: "Invalid nextToken" })
  public async list(
    @queryParam("limit") limit?: string,
    @queryParam("nextToken") nextToken?: string,
    @response res?: { get?: (name: string) => string }
  ) {
    const limitNum = Math.min(Math.max(parseInt(limit ?? "20", 10) || 20, 1), 100);
    let items: Cart[];
    let next: string | undefined;
    try {
      const result = await cartService.listCarts(limitNum, nextToken);
      items = result.items;
      next = result.nextToken;
    } catch (err) {
      if (err instanceof InvalidNextTokenError) {
        return { statusCode: 400, message: "Invalid nextToken" };
      }
      throw err;
    }
    const b = res ? baseUrl(res) : "";
    const data = items.map((c) => ({
      ...c,
      _links: {
        self: { href: `${b}/carts/${c.id}`, rel: "self" },
      },
    }));
    return {
      _links: paginationLinks(`${b}/carts`, limitNum, nextToken, next),
      _embedded: { items: data },
      nextToken: next,
    };
  }

  @GET("/:cartId")
  @apiOperation({ name: "Get cart", description: "Single cart by id with _links" })
  @apiResponse(200, { type: "object", description: "Cart with _links" })
  @apiResponse(404, { type: "object", description: "Cart not found" })
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
