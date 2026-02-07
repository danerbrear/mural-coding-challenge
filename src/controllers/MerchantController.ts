import { apiController, GET, queryParam, response } from "ts-lambda-api";
import * as orderService from "../services/orderService";
import * as withdrawalService from "../services/withdrawalService";

function baseUrl(res: { get?: (name: string) => string } | undefined): string {
  if (!res?.get) return "";
  const host = res.get("host") ?? "localhost";
  const proto = res.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

@apiController("merchant")
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
    const { items, nextToken: next } = await orderService.listAllOrders(limitNum, nextToken);
    const data = items.map((o) => ({
      ...o,
      _links: {
        self: { href: `${b}/merchant/orders?orderId=${o.id}`, rel: "self" },
        withdrawals: { href: `${b}/merchant/withdrawals?orderId=${o.id}`, rel: "withdrawals" },
      },
    }));
    return {
      _links: { self: { href: `${b}/merchant/orders`, rel: "self" } },
      _embedded: { items: data },
      items: data,
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
        items: data,
      };
    }
    const limitNum = Math.min(Math.max(parseInt(limit ?? "20", 10) || 20, 1), 100);
    const { items, nextToken: next } = await withdrawalService.listWithdrawals(limitNum, nextToken);
    const data = items.map((w) => ({
      ...w,
      _links: {
        self: { href: `${b}/merchant/withdrawals`, rel: "self" },
        order: { href: `${b}/merchant/orders?orderId=${w.orderId}`, rel: "order" },
      },
    }));
    return {
      _links: { self: { href: `${b}/merchant/withdrawals`, rel: "self" } },
      _embedded: { items: data },
      items: data,
      nextToken: next,
    };
  }
}
