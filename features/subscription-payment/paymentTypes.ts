import type { SubscriptionPaymentMethod } from '@/types';

export type PaymentChannel = 'mpesa' | 'airtel' | 'orange' | 'card' | 'points';
export type PaymentStage =
  | 'idle'
  | 'preparing'
  | 'phone_confirmation'
  | 'card_redirect'
  | 'operator_confirmation'
  | 'zwanga_activation'
  | 'waiting_long'
  | 'success'
  | 'failed';
export type PaymentCheckOutcome = 'success' | 'pending' | 'failed' | 'error';
export type PaymentProgressStatus = 'done' | 'current' | 'waiting' | 'paused' | 'error';
export type StoredPayment = {
  channel: PaymentChannel;
  createdAt: string;
  message?: string | null;
  orderNumber: string;
  paymentMethod: SubscriptionPaymentMethod;
  paymentUrl?: string | null;
  userId: string;
};

export const CARD_PAYMENT_RETURN_PATH = 'subscriptions/payment';
export const RECENT_PENDING_PAYMENT_MAX_AGE_MS = 30 * 60 * 1000;
export const AUTO_CHECK_INITIAL_DELAY_MS = 3500;
export const AUTO_CHECK_INTERVAL_MS = 8000;
export const AUTO_CHECK_TIMEOUT_MS = 90000;
export const AUTO_CHECK_MAX_ATTEMPTS = 8;
export const DRC_MOBILE_MONEY_PREFIX = '+243';
export const DRC_MOBILE_MONEY_REGEX = /^\+243\d{9}$/;
