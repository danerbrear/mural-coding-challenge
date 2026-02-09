import { injectable } from "inversify";
import { apiController, GET, queryParam, response } from "ts-lambda-api";
import { InvalidNextTokenError } from "../services/dynamodb";
import * as orderService from "../services/orderService";
import * as withdrawalService from "../services/withdrawalService";
import { paginationLinks } from "../utils/paginationLinks";

function baseUrl(res: { get?: (name: string) => string } | undefined): string {
  if (!res?.get) return "";
  const host = res.get("host") ?? "localhost";
  const proto = res.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

@apiController("merchant")
@injectable()
export class MerchantController {
  @GET("orders")
  public async listOrders(
    @queryParam("limit") limit?: string,
    @queryParam("nextToken") nextToken?: string,
    @queryParam("orderId") orderId?: string,
    @response res?: { get?: (name: string) => string }
  ) {
    const b = res ? baseUrl(res) : "";
    if (orderId) {
      const order = await orderService.getOrder(orderId);
      if (!order) return { statusCode: 404, message: "Order not found" };
      return {
        _links: {
          self: { href: `${b}/merchant/orders?orderId=${order.id}`, rel: "self" },
          withdrawals: { href: `${b}/merchant/withdrawals?orderId=${order.id}`, rel: "withdrawals" },
        },
        ...order,
      };
    }
    const limitNum = Math.min(Math.max(parseInt(limit ?? "20", 10) || 20, 1), 100);
    let items: Awaited<ReturnType<typeof orderService.listAllOrders>>["items"];
    let next: string | undefined;
    try {
      const result = await orderService.listAllOrders(limitNum, nextToken);
      items = result.items;
      next = result.nextToken;
    } catch (err) {
      if (err instanceof InvalidNextTokenError) {
        return { statusCode: 400, message: "Invalid nextToken" };
      }
      throw err;
    }
    const data = items.map((o) => ({
      ...o,
      _links: {
        self: { href: `${b}/merchant/orders?orderId=${o.id}`, rel: "self" },
        withdrawals: { href: `${b}/merchant/withdrawals?orderId=${o.id}`, rel: "withdrawals" },
      },
    }));
    return {
      _links: paginationLinks(`${b}/merchant/orders`, limitNum, nextToken, next),
      _embedded: { items: data },
      nextToken: next,
    };
  }

  @GET("withdrawals")
  public async listWithdrawals(
    @queryParam("limit") limit?: string,
    @queryParam("nextToken") nextToken?: string,
    @queryParam("orderId") orderId?: string,
    @response res?: { get?: (name: string) => string }
  ) {
    const b = res ? baseUrl(res) : "";
    if (orderId) {
      const items = await withdrawalService.listWithdrawalsByOrderId(orderId);
      const data = items.map((w) => ({
        ...w,
        _links: {
          self: { href: `${b}/merchant/withdrawals?orderId=${orderId}`, rel: "self" },
        },
      }));
      return {
        _links: { self: { href: `${b}/merchant/withdrawals?orderId=${orderId}`, rel: "self" } },
        _embedded: { items: data },
      };
    }
    const limitNum = Math.min(Math.max(parseInt(limit ?? "20", 10) || 20, 1), 100);
    let items: Awaited<ReturnType<typeof withdrawalService.listWithdrawals>>["items"];
    let next: string | undefined;
    try {
      const result = await withdrawalService.listWithdrawals(limitNum, nextToken);
      items = result.items;
      next = result.nextToken;
    } catch (err) {
      if (err instanceof InvalidNextTokenError) {
        return { statusCode: 400, message: "Invalid nextToken" };
      }
      throw err;
    }
    const data = items.map((w) => ({
      ...w,
      _links: {
        self: { href: `${b}/merchant/withdrawals`, rel: "self" },
        order: { href: `${b}/merchant/orders?orderId=${w.orderId}`, rel: "order" },
      },
    }));
    return {
      _links: paginationLinks(`${b}/merchant/withdrawals`, limitNum, nextToken, next),
      _embedded: { items: data },
      nextToken: next,
    };
  }
}
