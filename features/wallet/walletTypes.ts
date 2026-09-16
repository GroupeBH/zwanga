import type { SubscriptionPaymentMethod } from '@/types';

export type WalletAction = 'top_up' | 'transfer';
export type TopUpStage =
  | 'idle'
  | 'preparing'
  | 'phone_confirmation'
  | 'card_redirect'
  | 'checking'
  | 'waiting_long'
  | 'success'
  | 'failed';
export type TopUpCheckOutcome = 'success' | 'pending' | 'failed' | 'error';
export type StoredWalletTopUp = {
  amount: number;
  createdAt: string;
  message?: string | null;
  orderNumber: string;
  paymentMethod: SubscriptionPaymentMethod;
  paymentUrl?: string | null;
  userId: string;
};

export const DRC_PAYMENT_PHONE_PREFIX = '+243';
export const DRC_PAYMENT_PHONE_REGEX = /^\+243\d{9}$/;
export const WALLET_CARD_PAYMENT_RETURN_PATH = 'wallet';
export const WALLET_TOP_UP_STORAGE_PREFIX = 'zwanga:wallet:pending-top-up:';
export const RECENT_PENDING_TOP_UP_MAX_AGE_MS = 30 * 60 * 1000;
export const AUTO_CHECK_INITIAL_DELAY_MS = 3500;
export const AUTO_CHECK_INTERVAL_MS = 8000;
export const AUTO_CHECK_TIMEOUT_MS = 90000;
export const AUTO_CHECK_MAX_ATTEMPTS = 8;
