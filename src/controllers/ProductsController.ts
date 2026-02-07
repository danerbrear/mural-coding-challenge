import { apiController, GET, pathParam, queryParam, response } from "ts-lambda-api";
import * as productService from "../services/productService";
import type { Product } from "../models/types";

type Res = { get?: (name: string) => string };

function baseUrl(res: Res | undefined): string {
  if (!res?.get) return "";
  const host = res.get("host") ?? "localhost";
  const proto = res.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function productLinks(res: Res | undefined, id: string): Record<string, { href: string; rel: string }> {
  const b = baseUrl(res);
  return {
    self: { href: `${b}/products/${id}`, rel: "self" },
    collection: { href: `${b}/products`, rel: "collection" },
  };
}

@apiController("products")
export class ProductsController {
  @GET()
  public async list(
    @queryParam("limit") limit?: string,
    @queryParam("nextToken") nextToken?: string,
    @response res?: Res
  ) {
    await productService.ensureDefaultProducts();
    const limitNum = Math.min(Math.max(parseInt(limit ?? "20", 10) || 20, 1), 100);
    const { items, nextToken: next } = await productService.listProducts(limitNum, nextToken);
    const b = res ? baseUrl(res) : "";
    const data = items.map((p) => ({
      ...p,
      _links: {
        self: { href: `${b}/products/${p.id}`, rel: "self" },
      },
    }));
    return {
      _links: {
        self: { href: `${b}/products`, rel: "self" },
      },
      _embedded: { items: data },
      items: data,
      nextToken: next,
    };
  }

  @GET("/:id")
  public async get(@pathParam("id") id: string, @response res?: Res) {
    const product = await productService.getProduct(id);
    if (!product) return { statusCode: 404, message: "Product not found" };
    return {
      _links: res !== undefined ? productLinks(res, product.id) : { self: { href: `/products/${product.id}`, rel: "self" } },
      ...product,
    };
  }
}
