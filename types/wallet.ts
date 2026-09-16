import type { SubscriptionPaymentMethod, TripPaymentStatus } from './common';
import type { Booking } from './trips';
import type { SubscriptionPayment } from './subscriptions';

export interface BookingPayment {
  transactionId: string | null;
  method: SubscriptionPaymentMethod | null;
  reference: string | null;
  orderNumber: string | null;
  status: Exclude<TripPaymentStatus, 'not_required'> | null;
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
  type: 'points';
  balance: number | string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export type WalletLedgerEntryType =
  | 'top_up'
  | 'loyalty_reward'
  | 'booking_payment'
  | 'booking_refund'
  | 'booking_fare_adjustment'
  | 'subscription_payment'
  | 'subscription_reward'
  | 'transfer_out'
  | 'transfer_in';

export interface WalletLedgerEntry {
  id: string;
  accountId: string;
  userId: string;
  accountType: 'points';
  type: WalletLedgerEntryType;
  amount: number | string;
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
