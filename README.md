# Mural Marketplace Backend

Backend service for the Mural Pay coding challenge: marketplace where customers checkout with **USDC on Polygon (testnet)**, and merchants receive payment confirmation and automatic **conversion and withdrawal to COP**.

## Features

- **Customer API**: Product catalog, carts, checkout (POST /payments → 202 with deposit address), list withdrawals.
- **Merchant API**: List orders with payment status, list withdrawals (COP) with status.
- **Webhooks**: `POST /webhooks/mural` handles Mural `MURAL_ACCOUNT_BALANCE_ACTIVITY` (transfer.received) and `PAYOUT_REQUEST` (conversion/withdrawal status). Idempotent using DynamoDB.
- **Auto flow**: On incoming USDC deposit (webhook), payment is matched, order marked paid, then conversion + COP payout is created and executed via Mural API.

## Tech stack

- **TypeScript**, **Node 20**
- **ts-lambda-api** (Lambda + API Gateway, OpenAPI-capable)
- **DynamoDB** (products, carts, orders, payments, withdrawals, idempotency)
- **Terraform** (Lambda, API Gateway HTTP API, DynamoDB tables)

## Setup

### Prerequisites

- Node.js 20+
- Terraform 1.0+
- AWS CLI configured
- Mural Staging account: org, account, API key, Transfer API key. Merchant COP bank details for withdrawals.

### 1. Install and build

```bash
npm install
npm run build
# Ensure node_modules is inside dist for Lambda (copy:node_modules is part of build)
# If not, run: cp -r node_modules dist/
```

### 2. Terraform

Create `terraform/terraform.tfvars` (or export vars). **Where to find each value**:

| Variable | Where to find it |
|----------|------------------|
| **mural_api_key** | Mural platform: **Settings → Developers**. Create/copy the **API Key** (Bearer). Shown once; store securely. [Docs: Generate API Keys](https://developers.muralpay.com/docs/get-api-key) |
| **mural_transfer_api_key** | Same place: **Settings → Developers**. Create/copy the **Transfer API Key**. Required for executing payouts; pass as `transfer-api-key` header. [Docs](https://developers.muralpay.com/docs/get-api-key) |
| **mural_org_id** | Your **Organization ID** (UUID). Shown when you create an org via API, or in the Mural app (e.g. org/profile or URL). You can also call `GET https://api-staging.muralpay.com/api/organizations/search` (POST with body) or list from the platform. |
| **mural_account_id** | Your **Account ID** (UUID). After KYC, Mural creates an account for your org. Get it via **GET** `https://api-staging.muralpay.com/api/accounts` (with Bearer API key and `on-behalf-of: <mural_org_id>`), or from the Mural app (e.g. account/wallet details). [Accounts](https://developers.muralpay.com/docs/account) |
| **merchant_cop_*** | **Merchant COP bank details** for automatic withdrawal to Colombian Pesos. Use your (or test) Colombian bank details. For **sandbox**, the challenge says details don’t need to be real; use valid formats: phone (e.g. +57…), account number (6–18 digits), document number/type (e.g. NATIONAL_ID 6–10 digits), and a supported **bankName**. [COP validations](https://developers.muralpay.com/docs/validations) – use “Bank Name Validation” to get supported Colombian banks. |

- **Sandbox**: Use base URL `https://api-staging.muralpay.com`. You need access to the [Sandbox environment](https://developers.muralpay.com/docs/sandbox-environment) (invite/demo). KYC is auto-approved; you can fund the account via testnet USDC (e.g. [Circle faucet](https://faucet.circle.com/)) or fake EUR deposit in the app.

Create `terraform/terraform.tfvars` (or export vars):

```hcl
mural_api_key         = "your-mural-api-key"
mural_org_id          = "your-org-uuid"
mural_account_id      = "your-account-uuid"
mural_transfer_api_key = "your-transfer-api-key"

merchant_cop_phone_number   = "+57..."
merchant_cop_account_type   = "CHECKING"
merchant_cop_bank_account   = "..."
merchant_cop_document_number = "..."
merchant_cop_document_type  = "NATIONAL_ID"
merchant_cop_bank_name     = "..."
merchant_cop_account_owner = "..."
```

From repo root:

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

Output `api_endpoint` is the base URL of your API.

### 3. Register Mural webhook

After deployment, register your webhook with Mural so deposits and payout events are sent to your backend:

1. Create webhook: `POST https://api-staging.muralpay.com/api/webhooks` with body `{ "url": "https://YOUR_API_ENDPOINT/webhooks/mural", "categories": ["MURAL_ACCOUNT_BALANCE_ACTIVITY", "PAYOUT_REQUEST"] }`.
2. Activate it via PATCH webhook status to `ACTIVE`.

### 4. Test with cURL

- List products: `curl https://YOUR_API_ENDPOINT/products`
- Create cart: `curl -X POST https://YOUR_API_ENDPOINT/carts -H "Content-Type: application/json" -d '{"items":[{"productId":"<id>","quantity":1}]}'`
- Start payment (idempotent): `curl -X POST https://YOUR_API_ENDPOINT/payments -H "Content-Type: application/json" -d '{"cartId":"<cartId>","idempotencyKey":"unique-key-1"}'` → 202 with `destinationAddress`, `memo`, `expectedAmountUsdc`
- Merchant orders: `curl https://YOUR_API_ENDPOINT/merchant/orders`
- Merchant withdrawals: `curl https://YOUR_API_ENDPOINT/merchant/withdrawals`

## API overview

| Method | Path | Description |
|--------|------|-------------|
| GET | /products | List products (paginated) |
| GET | /products/:id | Get product |
| GET | /carts | List carts (paginated) |
| POST | /carts | Create cart (body: `items`, optional `idempotencyKey`) |
| GET | /carts/:cartId | Get cart |
| POST | /payments | Start payment → 202 + deposit details (idempotent by `idempotencyKey`) |
| GET | /withdrawals | List withdrawals (paginated) |
| GET | /merchant/orders | List orders or ?orderId= for one |
| GET | /merchant/withdrawals | List withdrawals or ?orderId= for one |
| POST | /webhooks/mural | Mural webhook (idempotent by event) |

List endpoints support `limit` and `nextToken`. Responses include `_links` (HATEOAS).

## OpenAPI

Backend API spec: [backend-openapi.json](./backend-openapi.json).

---

## Current status

- **Working**
  - Products (list, get); default products seeded on first list.
  - Carts (create, list, get).
  - Payments: POST /payments creates order + payment, returns 202 with Mural account deposit address and memo for USDC (Polygon testnet).
  - Idempotency: POST /payments and POST /webhooks/mural are idempotent (payment by `idempotencyKey`, webhook by `deliveryId`+`eventId` in DynamoDB).
  - Merchant orders and withdrawals (list, get by orderId).
  - Webhook handler: MURAL_ACCOUNT_BALANCE_ACTIVITY (deposit) triggers payment match and auto withdrawal; PAYOUT_REQUEST updates withdrawal/order status.
  - Auto conversion + COP withdrawal on payment received (create payout + execute with Mural API).

- **Pitfalls / limitations**
  - **Deposit matching**: Incoming USDC is matched to a pending payment by **expected amount only**. Same amount from two different orders can be ambiguous; using a unique memo (orderId) is recommended. Mural may send balance activity payload in a different shape than assumed; payload parsing may need to be adjusted per Mural’s event docs.
  - **Webhook payload**: PAYOUT_REQUEST and MURAL_ACCOUNT_BALANCE_ACTIVITY payload structures were inferred; if Mural’s production payload differs, handler may need updates.
  - **202 for POST /payments**: Implemented via `res.status(202)` where the framework exposes `res`; if the deployed stack doesn’t return 202, the integration may need a small framework-specific tweak.
  - No webhook signature verification (design allowed simple setup); add ECDSA verification using Mural’s webhook public key for production.

---

## Future work

- **Auth**: API key or simple header-based auth for merchant/customer endpoints.
- **Webhook signature verification**: Verify `x-mural-webhook-signature` with Mural’s public key.
- **Split Lambdas**: Separate functions for customer API, merchant API, webhook handler, and internal processing (e.g. conversion job).
- **EventBridge**: Emit internal events (payment.received, conversion.completed) and process conversion/withdrawal asynchronously to reduce Lambda time and improve retries.
- **DLQ**: Dead-letter queue for failed webhook deliveries and alerting.
- **Rate limiting**: Per-client or per-key limits at API Gateway or in-app.
- **Caching**: Cache product list and Mural account details where appropriate.
- **Stricter deposit matching**: Use memo (e.g. orderId) from Mural transaction payload when available to avoid amount-only collisions.
