# Mural Marketplace Backend

Backend service for the Mural Pay coding challenge: marketplace where customers checkout with **USDC on Polygon (testnet)**, and Dane Inc. receives payment confirmation and automatic **conversion and withdrawal to COP**.

## Quick Use

1. Import `backend-openapi.json` to Postman
2. Set the "baseUrl" variable to the URL from the Google Form
3. Execute the following sequence
    1. **GET /products** - Lists products to shop from
    2. **POST /cart** - Creates a cart of products you want to buy
    3. **POST /payment** - Purchase the items in a cart
    4. **GET /merchant/orders/{orderId}** - Check the order status of the specific purchase
    5. **GET /merchant/orders** - Get a list of all the orders' statuses for the account
    6. **GET /merchant/withdrawals/{withdrawalId}** - Check the withdrawal status for a purchase
    7. **GET /merchant/withdrawals** - Get a list of all withdrawals

Note: Scroll down for the respective curl commands

## Setup

### Prerequisites

- Node.js 20+
- Terraform 1.0+
- AWS CLI configured
- Mural Staging account

### 1. Install and build

```bash
npm install
npm run build
# Ensure node_modules is inside dist for Lambda (copy:node_modules is part of build)
# If not, run: cp -r node_modules dist/
```

### 2. Terraform

Create `terraform/terraform.tfvars` (or export vars):

| **sender_private_key** | Your **sender_private_key ID** is your Polygon Amoy wallet's private key. |

```hcl
sender_private_key = "..."
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

1. List products: `curl https://YOUR_API_ENDPOINT/products`
2. Create cart: `curl -X POST https://YOUR_API_ENDPOINT/carts -H "Content-Type: application/json" -d '{"items":[{"productId":"<id>","quantity":1}]}'`
3. Start payment: `curl -X POST https://YOUR_API_ENDPOINT/payments -H "Content-Type: application/json" -d '{"cartId":"<cartId>","idempotencyKey":"unique-key-1"}'` → 202 with `destinationAddress`, `memo`, `expectedAmountUsdc`
4. Merchant orders: `curl https://YOUR_API_ENDPOINT/merchant/orders`
5. Merchant withdrawals: `curl https://YOUR_API_ENDPOINT/merchant/withdrawals`

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
| GET | /merchant/orders | List orders (paginated) |
| GET | /merchant/withdrawals | List withdrawals (paginated) |
| POST | /webhooks/mural | Mural webhook (idempotent by event) |

List endpoints support `limit` and `nextToken`. Responses include `_links` (HATEOAS).

## OpenAPI

Backend API spec: [backend-openapi.json](./backend-openapi.json).

---

## Current status

- **Working**
  - Products (list, get); default products for this merchant.
  - Carts (create, list, get) - can shop for products.
  - Payments: POST /payments creates order + payment, returns 202 with Mural account deposit address and memo for USDC (Polygon testnet).
  - Merchant orders and withdrawals (list, get by orderId).
  - Webhook handler: MURAL_ACCOUNT_BALANCE_ACTIVITY (deposit) triggers payment match and auto withdrawal; PAYOUT_REQUEST updates withdrawal/order status.
  - Auto conversion + COP withdrawal on payment received (create payout + execute with Mural API).
  - Idempotency: POST methods are idempotent.
  - Pagination: GET methods that return a list of items can be paginated.

- **Pitfalls / limitations**
  - Payments can fail if the associated Polygon Amoy wallet runs out of gas or USDC.
  - No webhook signature verification (design allowed simple setup); add ECDSA verification using Mural’s webhook public key for production.

---

## Future Work

- Separate into multiple Lambdas by function (customer API, merchant API, webhook handler, internal processing).
- Use an EventBridge Event Bus + SQS to handle kicking off jobs which take increased processing load or time.
- Lambda cold start handling.
- Rate limiting.
- DLQ for failed webhook events.
- API caching.
- Expiring carts.
- Add endpoints: `DELETE /cart`, `PATCH /cart`.
- Hosted Zone failover.
- API Gateway custom domain.
- Secrets Manager for sensitive info.
- Semantic versioning

## Tech stack

- **TypeScript**, **Node 20**
- **ts-lambda-api** (Lambda + API Gateway, OpenAPI-capable)
- **DynamoDB** (products, carts, orders, payments, withdrawals, idempotency)
- **Terraform** (Lambda, API Gateway HTTP API, DynamoDB tables)