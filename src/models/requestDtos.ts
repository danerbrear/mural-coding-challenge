/**
 * Request body DTOs used for OpenAPI schema generation via @apiRequest({ class: ... }).
 * Each class has a static example() so ts-lambda-api can build a full schema from the instance.
 */

/** Item in a create-cart request. */
export class CartItemDto {
  productId = "";
  quantity = 1;

  static example(): CartItemDto {
    const e = new CartItemDto();
    e.productId = "prod_abc123";
    e.quantity = 2;
    return e;
  }
}

/** Request body for POST /carts */
export class CreateCartRequest {
  items: CartItemDto[] = [];
  idempotencyKey = "";

  static example(): CreateCartRequest {
    const e = new CreateCartRequest();
    e.items = [CartItemDto.example()];
    e.idempotencyKey = "cart-create-optional-key";
    return e;
  }
}

/** Request body for POST /payments */
export class CreatePaymentRequest {
  cartId = "";
  idempotencyKey = "";

  static example(): CreatePaymentRequest {
    const e = new CreatePaymentRequest();
    e.cartId = "cart-uuid-here";
    e.idempotencyKey = "payment-key-required";
    return e;
  }
}

/** Request body for POST /webhooks/mural */
export class MuralWebhookRequest {
  eventId = "";
  deliveryId = "";
  attemptNumber = 0;
  eventCategory: "MURAL_ACCOUNT_BALANCE_ACTIVITY" | "PAYOUT_REQUEST" = "MURAL_ACCOUNT_BALANCE_ACTIVITY";
  occurredAt = "";
  payload: Record<string, unknown> = {};

  static example(): MuralWebhookRequest {
    const e = new MuralWebhookRequest();
    e.eventId = "evt_123";
    e.deliveryId = "del_456";
    e.attemptNumber = 1;
    e.eventCategory = "MURAL_ACCOUNT_BALANCE_ACTIVITY";
    e.occurredAt = new Date().toISOString();
    e.payload = { type: "AccountCredited", transactionId: "tx_789" };
    return e;
  }
}
