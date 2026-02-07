import { v4 as uuidv4 } from "uuid";
import * as db from "./dynamodb";
import type { Payment } from "../models/types";
import { getAccount, getMuralAccountId } from "./muralClient";

export async function createPayment(
  orderId: string,
  expectedAmountUsdc: number,
  idempotencyKey: string
): Promise<Payment> {
  const existing = await getPaymentByIdempotencyKey(idempotencyKey);
  if (existing) return existing;

  const accountId = getMuralAccountId();
  const account = await getAccount(accountId);
  const walletDetails = account.accountDetails?.walletDetails;
  if (!walletDetails?.walletAddress) {
    throw new Error("Mural account has no wallet address - ensure account is ACTIVE and has blockchain payin");
  }

  const now = new Date().toISOString();
  const payment: Payment = {
    id: uuidv4(),
    orderId,
    expectedAmountUsdc,
    destinationAddress: walletDetails.walletAddress,
    blockchain: walletDetails.blockchain ?? "POLYGON",
    memo: orderId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    idempotencyKey,
  };
  await db.putItem("payments", payment);
  await db.putItem("idempotency", {
    key: `payment:${idempotencyKey}`,
    response: JSON.stringify(payment),
    ttl: Math.floor(Date.now() / 1000) + 86400 * 7,
  });
  return payment;
}

export async function getPayment(paymentId: string): Promise<Payment | null> {
  return db.getItem<Payment>("payments", { id: paymentId });
}

export async function getPaymentByOrderId(orderId: string): Promise<Payment | null> {
  const { items } = await db.query<Payment>("payments", "orderId = :oid", { "#oid": "orderId" }, { ":oid": orderId }, { indexName: "orderId-index", limit: 1 });
  return items[0] ?? null;
}

export async function findPendingPaymentByAmount(expectedAmountUsdc: number): Promise<Payment | null> {
  const { items } = await db.query<Payment>(
    "payments",
    "#s = :s AND expectedAmountUsdc = :amt",
    { "#s": "status" },
    { ":s": "pending", ":amt": expectedAmountUsdc },
    { indexName: "status-expectedAmount-index", limit: 10 }
  );
  return items[0] ?? null;
}

export async function getPaymentByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
  const row = await db.getItem<{ response?: string }>("idempotency", { key: `payment:${idempotencyKey}` });
  if (!row?.response) return null;
  return JSON.parse(row.response) as Payment;
}

export async function markPaymentReceived(paymentId: string, muralTransactionId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.updateItem("payments", { id: paymentId }, { status: "received", muralTransactionId, updatedAt: now });
}
