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
      console.warn("Webhook rejected: missing required fields", {
        hasEventId: !!event?.eventId,
        hasDeliveryId: !!event?.deliveryId,
        hasEventCategory: !!event?.eventCategory,
      });
      res?.status?.(400);
      return { message: "Invalid webhook payload" };
    }

    console.info("Webhook received", {
      eventCategory: event.eventCategory,
      eventId: event.eventId,
      deliveryId: event.deliveryId,
      attemptNumber: event.attemptNumber,
    });

    const idempotencyKey = db.getIdempotencyKey(event.deliveryId, event.eventId);
    const claimed = await db.claimIdempotency(idempotencyKey, IDEMPOTENCY_TTL);
    if (!claimed) {
      console.info("Webhook already processed (idempotent)", { eventId: event.eventId, idempotencyKey });
      res?.status?.(200);
      return { message: "Already processed" };
    }

    try {
      if (event.eventCategory === "MURAL_ACCOUNT_BALANCE_ACTIVITY") {
        await this.handleTransferReceived(event.payload, event.eventId);
      } else if (event.eventCategory === "PAYOUT_REQUEST") {
        await this.handlePayoutEvent(event.payload, event.eventId);
      } else {
        console.info("Webhook ignored: unsupported category", { eventCategory: event.eventCategory, eventId: event.eventId });
      }
      console.info("Webhook processed successfully", { eventCategory: event.eventCategory, eventId: event.eventId });
      res?.status?.(200);
      return { message: "OK" };
    } catch (err) {
      console.error("Webhook processing failed", {
        eventCategory: event.eventCategory,
        eventId: event.eventId,
        deliveryId: event.deliveryId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      res?.status?.(500);
      throw err;
    }
  }

  /** Mural payload: AccountCreditedPayload (type, tokenAmount: { tokenAmount, tokenSymbol }, transactionId). */
  private async handleTransferReceived(payload: unknown, eventId: string): Promise<void> {
    const p = payload as {
      type?: string;
      transactionId?: string;
      tokenAmount?: { tokenAmount?: number; tokenSymbol?: string };
      transactionDetails?: { type?: string; blockchain?: string };
      amount?: { tokenAmount?: number; tokenSymbol?: string };
    };
    if (p?.type !== "account_credited") {
      console.info("Balance activity ignored: not account_credited", { type: p?.type, eventId });
      return;
    }
    const tokenAmountObj = p.tokenAmount ?? p.amount;
    const tokenAmount = tokenAmountObj?.tokenAmount;
    const tokenSymbol = tokenAmountObj?.tokenSymbol;
    if (tokenSymbol !== "USDC" || tokenAmount == null) {
      console.info("Balance activity ignored: not USDC or missing amount", {
        tokenSymbol,
        tokenAmount: tokenAmount ?? null,
        eventId,
      });
      return;
    }

    console.info("Looking up pending payment by amount", { tokenAmountUsdc: tokenAmount, eventId });
    const payment = await paymentService.findPendingPaymentByAmount(tokenAmount);
    if (!payment) {
      console.warn("No pending payment found for amount", { tokenAmountUsdc: tokenAmount, eventId });
      return;
    }

    console.info("Payment matched, marking received and updating order", {
      paymentId: payment.id,
      orderId: payment.orderId,
      muralTransactionId: p.transactionId,
      eventId,
    });
    await paymentService.markPaymentReceived(payment.id, p.transactionId ?? "");
    await orderService.updateOrderStatus(payment.orderId, "paid", {
      paidAt: new Date().toISOString(),
      muralTransactionId: p.transactionId,
    });

    console.info("Triggering conversion and withdrawal", { orderId: payment.orderId, paymentId: payment.id, eventId });
    await this.triggerConversionAndWithdrawal(payment.orderId, payment.id, payment.expectedAmountUsdc, payment.idempotencyKey);
  }

  private async triggerConversionAndWithdrawal(
    orderId: string,
    paymentId: string,
    amountUsdc: number,
    idempotencyKey: string
  ): Promise<void> {
    console.info("Starting conversion and withdrawal", { orderId, paymentId, amountUsdc });
    await orderService.updateOrderStatus(orderId, "converting", {});
    try {
      const withdrawal = await withdrawalService.createAndExecuteWithdrawal(orderId, paymentId, amountUsdc, `withdrawal:${idempotencyKey}`);
      await orderService.updateOrderStatus(orderId, "withdrawal_pending", {
        payoutRequestId: withdrawal.payoutRequestId,
        withdrawalId: withdrawal.id,
      });
      console.info("Withdrawal created and executed", {
        orderId,
        withdrawalId: withdrawal.id,
        payoutRequestId: withdrawal.payoutRequestId,
      });
    } catch (err) {
      console.error("Withdrawal failed", {
        orderId,
        paymentId,
        error: err instanceof Error ? err.message : String(err),
      });
      await orderService.updateOrderStatus(orderId, "withdrawal_failed", {});
    }
  }

  /** Mural payload: PayoutStatusChangedPayload (statusChangeDetails.currentStatus.type) or PayoutRequestStatusChangedPayload. */
  private async handlePayoutEvent(payload: unknown, eventId: string): Promise<void> {
    const p = payload as {
      type?: string;
      payoutRequestId?: string;
      statusChangeDetails?: { type?: string; currentStatus?: { type?: string }; previousStatus?: { type?: string } };
      recipientsPayoutDetails?: Array<{ fiatPayoutStatus?: { type: string } }>;
      status?: string;
    };
    const payoutRequestId = p?.payoutRequestId;
    if (!payoutRequestId) {
      console.info("Payout event ignored: no payoutRequestId", { eventId });
      return;
    }

    const statusChange = p.statusChangeDetails;
    const currentStatusType =
      statusChange?.currentStatus?.type ??
      p.recipientsPayoutDetails?.[0]?.fiatPayoutStatus?.type ??
      p.status;
    console.info("Payout event received", { payoutRequestId, currentStatusType, eventId });

    const withdrawal = await findWithdrawalByPayoutRequestId(payoutRequestId);
    if (!withdrawal) {
      console.warn("No withdrawal found for payout request", { payoutRequestId, eventId });
      return;
    }

    if (currentStatusType === "completed" || currentStatusType === "executed") {
      console.info("Payout completed, updating withdrawal and order", {
        withdrawalId: withdrawal.id,
        orderId: withdrawal.orderId,
        eventId,
      });
      await withdrawalService.updateWithdrawalStatus(withdrawal.id, "completed");
      await orderService.updateOrderStatus(withdrawal.orderId, "withdrawal_completed", {});
    } else if (
      currentStatusType === "refunded" ||
      currentStatusType === "refundInProgress" ||
      currentStatusType === "failed"
    ) {
      console.warn("Payout failed or refunded", {
        withdrawalId: withdrawal.id,
        orderId: withdrawal.orderId,
        currentStatusType,
        eventId,
      });
      await withdrawalService.updateWithdrawalStatus(withdrawal.id, "failed", { failureReason: String(payload) });
      await orderService.updateOrderStatus(withdrawal.orderId, "withdrawal_failed", {});
    } else {
      console.info("Payout event: status not yet final", { currentStatusType, withdrawalId: withdrawal.id, eventId });
    }
  }
}

async function findWithdrawalByPayoutRequestId(payoutRequestId: string): Promise<{ id: string; orderId: string } | null> {
  const { items } = await db.scan<{ id: string; orderId: string; payoutRequestId?: string }>("withdrawals", { limit: 100 });
  return items.find((w) => w.payoutRequestId === payoutRequestId) ?? null;
}
