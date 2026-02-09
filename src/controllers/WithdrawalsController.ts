import { injectable } from "inversify";
import { apiController, GET, queryParam, response } from "ts-lambda-api";
import { InvalidNextTokenError } from "../services/dynamodb";
import * as withdrawalService from "../services/withdrawalService";
import { paginationLinks } from "../utils/paginationLinks";

function baseUrl(res: { get?: (name: string) => string } | undefined): string {
  if (!res?.get) return "";
  const host = res.get("host") ?? "localhost";
  const proto = res.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

@apiController("withdrawals")
@injectable()
export class WithdrawalsController {
  @GET()
  public async list(
    @queryParam("limit") limit?: string,
    @queryParam("nextToken") nextToken?: string,
    @response res?: { get?: (name: string) => string }
  ) {
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
    const b = res ? baseUrl(res) : "";
    const data = items.map((w) => ({
      ...w,
      _links: {
        self: { href: `${b}/withdrawals/${w.id}`, rel: "self" },
        order: { href: `${b}/merchant/orders?orderId=${w.orderId}`, rel: "order" },
      },
    }));
    return {
      _links: paginationLinks(`${b}/withdrawals`, limitNum, nextToken, next),
      _embedded: { items: data },
      nextToken: next,
    };
  }
}
