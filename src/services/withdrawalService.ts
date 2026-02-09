import { v4 as uuidv4 } from "uuid";
import * as db from "./dynamodb";
import type { Withdrawal } from "../models/types";
import { createPayoutRequest, executePayoutRequest, getMuralAccountId } from "./muralClient";

const MERCHANT_COP = {
  phoneNumber: process.env.MERCHANT_COP_PHONE_NUMBER ?? "",
  accountType: process.env.MERCHANT_COP_ACCOUNT_TYPE ?? "CHECKING",
  bankAccountNumber: process.env.MERCHANT_COP_BANK_ACCOUNT ?? "",
  documentNumber: process.env.MERCHANT_COP_DOCUMENT_NUMBER ?? "",
  documentType: process.env.MERCHANT_COP_DOCUMENT_TYPE ?? "NATIONAL_ID",
  bankName: process.env.MERCHANT_COP_BANK_NAME ?? "",
  bankAccountOwner: process.env.MERCHANT_COP_ACCOUNT_OWNER ?? "",
};

export async function createAndExecuteWithdrawal(
  orderId: string,
  paymentId: string,
  amountUsdc: number,
  idempotencyKey: string
): Promise<Withdrawal> {
  const existing = await listWithdrawalsByOrderId(orderId);
  if (existing.length > 0) {
    console.log("Withdrawal already exists for order", orderId);
    return existing[0];
  }

  const now = new Date().toISOString();
  const withdrawal: Withdrawal = {
    id: uuidv4(),
    orderId,
    paymentId,
    status: "pending",
    amountUsdc: amountUsdc,
    createdAt: now,
    updatedAt: now,
    idempotencyKey,
  };
  await db.putItem("withdrawals", withdrawal);

  try {
    const payout = await createPayoutRequest({
      sourceAccountId: getMuralAccountId(),
      memo: `Order ${orderId}`,
      payouts: [
        {
          amount: { tokenAmount: amountUsdc, tokenSymbol: "USDC" },
          payoutDetails: {
            type: "fiat",
            bankName: MERCHANT_COP.bankName,
            bankAccountOwner: MERCHANT_COP.bankAccountOwner,
            fiatAndRailDetails: {
              type: "cop",
              symbol: "COP",
              phoneNumber: MERCHANT_COP.phoneNumber,
              accountType: MERCHANT_COP.accountType,
              bankAccountNumber: MERCHANT_COP.bankAccountNumber,
              documentNumber: MERCHANT_COP.documentNumber,
              documentType: MERCHANT_COP.documentType,
            },
          },
          recipientInfo: {
            type: "individual",
            firstName: MERCHANT_COP.bankAccountOwner.split(" ")[0] ?? "Merchant",
            lastName: MERCHANT_COP.bankAccountOwner.split(" ").slice(1).join(" ") || "Account",
            email: "merchant@example.com",
            physicalAddress: {
              address1: "123 Main St",
              country: "CO",
              state: "CO",
              city: "Bogota",
              zip: "110111",
            },
          },
        },
      ],
    });

    await db.updateItem("withdrawals", { id: withdrawal.id }, {
      payoutRequestId: payout.id,
      status: "payout_created",
      updatedAt: new Date().toISOString(),
    });

    const executed = await executePayoutRequest(payout.id);
    const fiatAmount = executed.payouts?.[0]?.details && "fiatAmount" in executed.payouts[0].details
      ? (executed.payouts[0].details as { fiatAmount?: { fiatAmount: number } }).fiatAmount
      : undefined;

    await db.updateItem("withdrawals", { id: withdrawal.id }, {
      status: executed.status === "EXECUTED" ? "executed" : "pending",
      amountCop: fiatAmount,
      updatedAt: new Date().toISOString(),
    });

    const updated = await db.getItem<Withdrawal>("withdrawals", { id: withdrawal.id });
    return updated ?? withdrawal;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.updateItem("withdrawals", { id: withdrawal.id }, {
      status: "failed",
      failureReason: msg,
      updatedAt: new Date().toISOString(),
    });
    throw err;
  }
}

export async function getWithdrawal(withdrawalId: string): Promise<Withdrawal | null> {
  return db.getItem<Withdrawal>("withdrawals", { id: withdrawalId });
}

export async function listWithdrawalsByOrderId(orderId: string): Promise<Withdrawal[]> {
  const { items } = await db.query<Withdrawal>(
    "withdrawals",
    "orderId = :oid",
    { "#oid": "orderId" },
    { ":oid": orderId },
    { indexName: "orderId-index" }
  );
  return items;
}

export async function listWithdrawals(limit = 20, nextToken?: string): Promise<{ items: Withdrawal[]; nextToken?: string }> {
  return db.scan<Withdrawal>("withdrawals", { limit, nextToken });
}

export async function updateWithdrawalStatus(
  withdrawalId: string,
  status: Withdrawal["status"],
  extra?: Partial<Withdrawal>
): Promise<void> {
  const updates: Record<string, unknown> = { status, updatedAt: new Date().toISOString() };
  if (extra) Object.assign(updates, extra);
  await db.updateItem("withdrawals", { id: withdrawalId }, updates);
}
