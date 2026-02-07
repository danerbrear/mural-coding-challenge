import { apiController, GET, queryParam, response } from "ts-lambda-api";
import * as withdrawalService from "../services/withdrawalService";

function baseUrl(res: { get?: (name: string) => string } | undefined): string {
  if (!res?.get) return "";
  const host = res.get("host") ?? "localhost";
  const proto = res.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

@apiController("withdrawals")
export class WithdrawalsController {
  @GET()
  public async list(
    @queryParam("limit") limit?: string,
    @queryParam("nextToken") nextToken?: string,
    @response res?: { get?: (name: string) => string }
  ) {
    const limitNum = Math.min(Math.max(parseInt(limit ?? "20", 10) || 20, 1), 100);
    const { items, nextToken: next } = await withdrawalService.listWithdrawals(limitNum, nextToken);
    const b = res ? baseUrl(res) : "";
    const data = items.map((w) => ({
      ...w,
      _links: {
        self: { href: `${b}/withdrawals/${w.id}`, rel: "self" },
        order: { href: `${b}/merchant/orders?orderId=${w.orderId}`, rel: "order" },
      },
    }));
    return {
      _links: { self: { href: `${b}/withdrawals`, rel: "self" } },
      _embedded: { items: data },
      items: data,
      nextToken: next,
    };
  }
}
