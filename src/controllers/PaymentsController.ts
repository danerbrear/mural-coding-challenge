import { injectable } from "inversify";
import { apiController, apiOperation, apiRequest, apiResponse, POST, body, response } from "ts-lambda-api";
import { v4 as uuidv4 } from "uuid";
import * as cartService from "../services/cartService";
import * as orderService from "../services/orderService";
import * as paymentService from "../services/paymentService";
import * as productService from "../services/productService";
import { CreatePaymentRequest } from "../models/requestDtos";

function baseUrl(res: { get?: (name: string) => string; status?: (code: number) => void } | undefined): string {
  if (!res?.get) return "";
  const host = res.get("host") ?? "localhost";
  const proto = res.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

interface CreatePaymentBody {
  cartId: string;
  idempotencyKey: string;
}

@apiController("payments")
@injectable()
export class PaymentsController {
  @POST()
  @apiOperation({ name: "Start payment", description: "Start payment (idempotent). Returns 202 Accepted with deposit address and amount for USDC." })
  @apiRequest({ class: CreatePaymentRequest })
  @apiResponse(202, { type: "object", description: "Accepted – send USDC to returned destinationAddress with memo" })
  @apiResponse(400, { type: "object", description: "Bad request" })
  @apiResponse(404, { type: "object", description: "Cart not found" })
  public async create(@body body: CreatePaymentBody, @response res?: { get?: (name: string) => string; status?: (code: number) => void }) {
    const { cartId, idempotencyKey } = body ?? {};
    if (!cartId || !idempotencyKey) {
      return { statusCode: 400, message: "cartId and idempotencyKey are required" };
    }
    const cart = await cartService.getCart(cartId);
    if (!cart) return { statusCode: 404, message: "Cart not found" };

    let totalUsdc = 0;
    for (const item of cart.items) {
      const product = await productService.getProduct(item.productId);
      if (!product) return { statusCode: 400, message: `Product ${item.productId} not found` };
      totalUsdc += product.priceUsdc * item.quantity;
    }
    if (totalUsdc <= 0) return { statusCode: 400, message: "Cart total must be positive" };

    const orderId = uuidv4();
    let payment;
    try {
      payment = await paymentService.createPayment(orderId, totalUsdc, idempotencyKey);
    } catch (err) {
      console.error("Payment creation failed:", err);
      return { statusCode: 500, message: "Payment creation failed" };
    }

    await orderService.createOrder({
      id: payment.orderId,
      cartId,
      paymentId: payment.id,
      status: "pending_payment",
      totalUsdc,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const b = res ? baseUrl(res) : "";
    res?.status?.(202);
    const responseBody: Record<string, unknown> = {
      _links: {
        self: { href: `${b}/payments`, rel: "self" },
        order: { href: `${b}/merchant/orders?orderId=${payment.orderId}`, rel: "order" },
      },
      message: payment.transactionHash
        ? "Payment sent. USDC transfer submitted by backend."
        : "Payment processing started. Send USDC to the deposit address.",
      orderId: payment.orderId,
      paymentId: payment.id,
      expectedAmountUsdc: payment.expectedAmountUsdc,
      destinationAddress: payment.destinationAddress,
      blockchain: payment.blockchain,
      memo: payment.memo,
    };
    if (payment.transactionHash) {
      responseBody.transactionHash = payment.transactionHash;
    }
    return responseBody;
  }
}
