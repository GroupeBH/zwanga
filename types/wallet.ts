import type { SubscriptionPaymentMethod, TripPaymentStatus } from "./common";
import type { Booking } from "./trips";
import type { SubscriptionPayment } from "./subscriptions";

export interface BookingPayment {
  transactionId: string | null;
  method: SubscriptionPaymentMethod | null;
  reference: string | null;
  orderNumber: string | null;
  status: Exclude<TripPaymentStatus, "not_required"> | null;
  statusCode: string | null;
  message: string | null;
  paymentUrl: string | null;
  amount: number;
  currency: string;
}

export interface BookingPaymentResponse {
  booking: Booking;
  payment: BookingPayment;
}

export interface WalletAccount {
  id: string;
  userId: string;
  type: "points";
  balance: number | string;
  withdrawableBalance?: number | string;
  reservedWithdrawalBalance?: number | string;
  withdrawalsBlocked?: boolean;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export type WalletLedgerEntryType =
  | "top_up"
  | "loyalty_reward"
  | "booking_payment"
  | "booking_refund"
  | "booking_fare_adjustment"
  | "subscription_payment"
  | "subscription_reward"
  | "transfer_out"
  | "transfer_in"
  | "admin_adjustment"
  | "withdrawal"
  | "withdrawal_refund";

export interface WalletLedgerEntry {
  id: string;
  accountId: string;
  userId: string;
  accountType: "points";
  type: WalletLedgerEntryType;
  amount: number | string;
  withdrawableAmount?: number | string | null;
  balanceAfter: number | string;
  currency: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  paymentTransactionId?: string | null;
  description?: string | null;
  createdAt: string;
}

export interface WalletSummary {
  account: WalletAccount;
  recentEntries: WalletLedgerEntry[];
  withdrawal?: {
    enabled: boolean;
    currency: string;
    moneyPerToken: number;
    minimumTokens: number;
    availableMoney: number;
    nonWithdrawableTokens: number;
    blocked: boolean;
  };
}

export interface WalletWithdrawal {
  id: string;
  idempotencyKey: string;
  tokens: number;
  amount: number;
  currency: string;
  moneyPerToken: number;
  phone: string;
  createdAt: string;
  orderNumber: string | null;
  status:
    "pending" | "initiated" | "succeeded" | "failed" | "cancelled" | "review";
  message: string;
}

export interface WalletPaymentResponse {
  account: WalletAccount;
  payment: SubscriptionPayment;
}

export interface WalletTransferResponse {
  transferId: string;
  amount: number;
  currency: string;
  senderAccount: WalletAccount;
  recipientAccount: WalletAccount;
  senderEntry: WalletLedgerEntry;
  recipientEntry: WalletLedgerEntry;
  recipient: {
    id: string;
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    email?: string | null;
  };
}
