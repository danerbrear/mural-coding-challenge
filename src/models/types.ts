export interface Product {
  id: string;
  name: string;
  description?: string;
  priceUsdc: number;
  createdAt: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = "pending_payment" | "paid" | "converting" | "withdrawal_pending" | "withdrawal_completed" | "withdrawal_failed";

export interface Order {
  id: string;
  cartId: string;
  paymentId: string;
  status: OrderStatus;
  totalUsdc: number;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  muralTransactionId?: string;
  payoutRequestId?: string;
  withdrawalId?: string;
}

export type PaymentStatus = "pending" | "received" | "expired";

export interface Payment {
  id: string;
  orderId: string;
  expectedAmountUsdc: number;
  destinationAddress: string;
  blockchain: string;
  memo: string;
  status: PaymentStatus;
  muralTransactionId?: string;
  /** Transaction hash when backend sent USDC to the destination (if applicable). */
  transactionHash?: string;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
}

export type WithdrawalStatus =
  | "pending"
  | "payout_created"
  | "executed"
  | "completed"
  | "failed"
  | "refunded";

export interface Withdrawal {
  id: string;
  orderId: string;
  paymentId: string;
  payoutRequestId?: string;
  status: WithdrawalStatus;
  amountUsdc: number;
  amountCop?: number;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextToken?: string;
  total?: number;
}

export interface Link {
  href: string;
  rel: string;
  type?: string;
}

export interface HalResource<T> {
  _links: Record<string, Link>;
  _embedded?: Record<string, unknown>;
  data: T;
}
