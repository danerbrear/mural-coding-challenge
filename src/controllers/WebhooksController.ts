import { apiController, POST, body, request, response } from "ts-lambda-api";
import * as db from "../services/dynamodb";
import * as orderService from "../services/orderService";
import * as paymentService from "../services/paymentService";
import * as withdrawalService from "../services/withdrawalService";

const IDEMPOTENCY_TTL = 86400 * 7; // 7 days

interface MuralWebhookEvent {
  eventId: string;
  deliveryId: string;
  attemptNumber: number;
  eventCategory: "MURAL_ACCOUNT_BALANCE_ACTIVITY" | "PAYOUT_REQUEST";
  occurredAt: string;
  payload: unknown;
}

type Res = { status?: (code: number) => void };

@apiController("webhooks")
export class WebhooksController {
  @POST("mural")
  public async mural(@body body: MuralWebhookEvent, @request _req?: unknown, @response res?: Res) {
    const event = body as MuralWebhookEvent;
    if (!event?.eventId || !event?.deliveryId || !event?.eventCategory) {
      res?.status?.(400);
      return { message: "Invalid webhook payload" };
    }

    const idempotencyKey = db.getIdempotencyKey(event.deliveryId, event.eventId);
    const claimed = await db.claimIdempotency(idempotencyKey, IDEMPOTENCY_TTL);
    if (!claimed) {
      res?.status?.(200);
      return { message: "Already processed" };
    }

    try {
      if (event.eventCategory === "MURAL_ACCOUNT_BALANCE_ACTIVITY") {
        await this.handleTransferReceived(event.payload);
      } else if (event.eventCategory === "PAYOUT_REQUEST") {
        await this.handlePayoutEvent(event.payload);
      }
      res?.status?.(200);
      return { message: "OK" };
    } catch (err) {
      res?.status?.(500);
      throw err;
    }
  }

  private async handleTransferReceived(payload: unknown): Promise<void> {
    const p = payload as { transactionId?: string; amount?: { tokenAmount?: number; tokenSymbol?: string }; accountId?: string; transactionDetails?: { type: string; details?: { senderAddress?: string; blockchain?: string } } };
    if (!p?.transactionDetails?.type || p.transactionDetails.type !== "deposit") return;
    const details = p.transactionDetails.details as { blockchain?: string } | undefined;
    if (!details?.blockchain) return;
    const tokenAmount = p.amount?.tokenAmount;
    const tokenSymbol = p.amount?.tokenSymbol;
    if (tokenSymbol !== "USDC" || tokenAmount == null) return;

    const payment = await paymentService.findPendingPaymentByAmount(tokenAmount);
    if (!payment) return;

    await paymentService.markPaymentReceived(payment.id, p.transactionId ?? "");
    await orderService.updateOrderStatus(payment.orderId, "paid", {
      paidAt: new Date().toISOString(),
      muralTransactionId: p.transactionId,
    });

    await this.triggerConversionAndWithdrawal(payment.orderId, payment.id, payment.expectedAmountUsdc, payment.idempotencyKey);
  }

  private async triggerConversionAndWithdrawal(
    orderId: string,
    paymentId: string,
    amountUsdc: number,
    idempotencyKey: string
  ): Promise<void> {
    await orderService.updateOrderStatus(orderId, "converting", {});
    try {
      const withdrawal = await withdrawalService.createAndExecuteWithdrawal(orderId, paymentId, amountUsdc, `withdrawal:${idempotencyKey}`);
      await orderService.updateOrderStatus(orderId, "withdrawal_pending", {
        payoutRequestId: withdrawal.payoutRequestId,
        withdrawalId: withdrawal.id,
      });
    } catch {
      await orderService.updateOrderStatus(orderId, "withdrawal_failed", {});
    }
  }

  private async handlePayoutEvent(payload: unknown): Promise<void> {
    const p = payload as { payoutRequestId?: string; payoutId?: string; status?: string; recipientsPayoutDetails?: Array<{ fiatPayoutStatus?: { type: string } }> };
    const payoutRequestId = p?.payoutRequestId;
    if (!payoutRequestId) return;

    const withdrawal = await findWithdrawalByPayoutRequestId(payoutRequestId);
    if (!withdrawal) return;

    const fiatStatus = p.recipientsPayoutDetails?.[0]?.fiatPayoutStatus?.type ?? p.status;
    if (fiatStatus === "completed") {
      await withdrawalService.updateWithdrawalStatus(withdrawal.id, "completed");
      await orderService.updateOrderStatus(withdrawal.orderId, "withdrawal_completed", {});
    } else if (fiatStatus === "refunded" || fiatStatus === "refundInProgress" || fiatStatus === "failed") {
      await withdrawalService.updateWithdrawalStatus(withdrawal.id, "failed", { failureReason: String(payload) });
      await orderService.updateOrderStatus(withdrawal.orderId, "withdrawal_failed", {});
    }
  }
}

async function findWithdrawalByPayoutRequestId(payoutRequestId: string): Promise<{ id: string; orderId: string } | null> {
  const { items } = await db.scan<{ id: string; orderId: string; payoutRequestId?: string }>("withdrawals", { limit: 100 });
  return items.find((w) => w.payoutRequestId === payoutRequestId) ?? null;
}
