import { injectable } from "inversify";
import { apiController, apiOperation, apiResponse, GET, pathParam, queryParam, response } from "ts-lambda-api";
import { InvalidNextTokenError } from "../services/dynamodb";
import * as withdrawalService from "../services/withdrawalService";
import { paginationLinks } from "../utils/paginationLinks";

function baseUrl(res: { get?: (name: string) => string } | undefined): string {
  if (!res?.get) return "";
  const host = res.get("host") ?? "localhost";
  const proto = res.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

@apiController("merchant/withdrawals")
@injectable()
export class MerchantWithdrawalsController {
  @GET("/:id")
  @apiOperation({ name: "Get withdrawal", description: "Single withdrawal by id with _links" })
  @apiResponse(200, { type: "object", description: "Withdrawal with _links" })
  @apiResponse(404, { type: "object", description: "Withdrawal not found" })
  public async get(
    @pathParam("id") id: string,
    @response res?: { get?: (name: string) => string }
  ) {
    const b = res ? baseUrl(res) : "";
    const withdrawal = await withdrawalService.getWithdrawal(id);
    if (!withdrawal) return { statusCode: 404, message: "Withdrawal not found" };
    return {
      _links: {
        self: { href: `${b}/merchant/withdrawals/${withdrawal.id}`, rel: "self" },
        order: { href: `${b}/merchant/orders/${withdrawal.orderId}`, rel: "order" },
      },
      ...withdrawal,
    };
  }

  @GET()
  @apiOperation({ name: "List withdrawals", description: "Paginated list of withdrawals, optionally filter by orderId" })
  @apiResponse(200, { type: "object", description: "Withdrawals with _links" })
  @apiResponse(400, { type: "object", description: "Invalid nextToken" })
  public async list(
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
          self: { href: `${b}/merchant/withdrawals/${w.id}`, rel: "self" },
          order: { href: `${b}/merchant/orders/${w.orderId}`, rel: "order" },
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
        self: { href: `${b}/merchant/withdrawals/${w.id}`, rel: "self" },
        order: { href: `${b}/merchant/orders/${w.orderId}`, rel: "order" },
      },
    }));
    return {
      _links: paginationLinks(`${b}/merchant/withdrawals`, limitNum, nextToken, next),
      _embedded: { items: data },
      nextToken: next,
    };
  }
}
