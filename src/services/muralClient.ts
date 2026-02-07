const MURAL_API_URL = process.env.MURAL_API_URL ?? "https://api-staging.muralpay.com";
const MURAL_API_KEY = process.env.MURAL_API_KEY ?? "";
const MURAL_ORG_ID = process.env.MURAL_ORG_ID ?? "";
const MURAL_ACCOUNT_ID = process.env.MURAL_ACCOUNT_ID ?? "";
const MURAL_TRANSFER_API_KEY = process.env.MURAL_TRANSFER_API_KEY ?? "";

export interface MuralAccount {
  id: string;
  accountDetails?: {
    walletDetails?: { walletAddress: string; blockchain: string };
    payinMethods?: unknown[];
  };
}

export interface MuralTransaction {
  id: string;
  transactionExecutionDate: string;
  amount?: { tokenAmount: number; tokenSymbol: string };
  memo?: string;
  accountId: string;
  transactionDetails?: {
    type: string;
    details?: { senderAddress?: string; blockchain?: string };
  };
}

export interface MuralPayoutRequest {
  id: string;
  status: string;
  sourceAccountId: string;
  payouts?: Array<{
    id: string;
    details?: { type: string; fiatPayoutStatus?: { type: string }; fiatAmount?: { fiatAmount: number; fiatCurrencyCode: string } };
  }>;
}

async function muralFetch<T>(
  path: string,
  options: { method?: string; body?: object; headers?: Record<string, string> } = {}
): Promise<T> {
  const { method = "GET", body, headers: customHeaders } = options;
  const url = path.startsWith("http") ? path : `${MURAL_API_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${MURAL_API_KEY}`,
    "Content-Type": "application/json",
    ...((customHeaders as Record<string, string>) ?? {}),
  };
  if (MURAL_ORG_ID) headers["on-behalf-of"] = MURAL_ORG_ID;
  const bodyStr: string | undefined = body !== undefined && body !== null ? JSON.stringify(body) : undefined;
  const res = await fetch(url, {
    method,
    headers,
    body: bodyStr,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mural API ${res.status}: ${text}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return {} as T;
  return res.json() as Promise<T>;
}

export async function getAccount(accountId: string): Promise<MuralAccount> {
  return muralFetch<MuralAccount>(`/api/accounts/${accountId}`);
}

export async function searchTransactions(
  accountId: string,
  options?: { limit?: number; nextId?: string }
): Promise<{ results: MuralTransaction[]; nextId?: string }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.nextId) params.set("nextId", options.nextId);
  const qs = params.toString();
  const path = `/api/transactions/search/account/${accountId}${qs ? `?${qs}` : ""}`;
  const body = {};
  const data = await muralFetch<{ results: MuralTransaction[]; nextId?: string }>(path, {
    method: "POST",
    body,
  });
  return data;
}

export async function createPayoutRequest(params: {
  sourceAccountId: string;
  memo: string;
  payouts: Array<{
    amount: { tokenAmount: number; tokenSymbol: string };
    payoutDetails: {
      type: "fiat";
      bankName: string;
      bankAccountOwner: string;
      fiatAndRailDetails: {
        type: "cop";
        symbol: "COP";
        phoneNumber: string;
        accountType: string;
        bankAccountNumber: string;
        documentNumber: string;
        documentType: string;
      };
    };
    recipientInfo: { type: "individual"; firstName: string; lastName: string; email: string; physicalAddress: { address1: string; country: string; state: string; city: string; zip: string } };
  }>;
}): Promise<MuralPayoutRequest> {
  return muralFetch<MuralPayoutRequest>("/api/payouts/payout", {
    method: "POST",
    body: params,
  });
}

export async function executePayoutRequest(payoutRequestId: string): Promise<MuralPayoutRequest> {
  const headers: Record<string, string> = {
    "transfer-api-key": MURAL_TRANSFER_API_KEY,
  };
  return muralFetch<MuralPayoutRequest>(`/api/payouts/payout/${payoutRequestId}/execute`, {
    method: "POST",
    body: { exchangeRateToleranceMode: "FLEXIBLE" },
    headers,
  });
}

export async function getPayoutRequest(payoutRequestId: string): Promise<MuralPayoutRequest> {
  return muralFetch<MuralPayoutRequest>(`/api/payouts/payout/${payoutRequestId}`);
}

export function getMuralAccountId(): string {
  return MURAL_ACCOUNT_ID;
}

export function getMuralOrgId(): string {
  return MURAL_ORG_ID;
}
