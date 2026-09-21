import type {
  SubscriptionPaymentMethod,
  SubscriptionPaymentStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from './common';
import type { WalletLedgerEntry } from './wallet';

export interface SubscriptionPlanSummary {
  plan: SubscriptionPlan;
  amount: number | string;
  currency: string;
  premiumBadgeEnabled: boolean;
  featuredTripsEnabled: boolean;
  documentFundingEnabled: boolean;
  documentFundingLimit: number | null;
  documentFundingCurrency?: string;
  paymentMethods?: Array<SubscriptionPaymentMethod | 'points'>;
  pointsAmount?: number | string | null;
  pointsCurrency?: string | null;
  tokensAmount?: number | string | null;
  tokensCurrency?: string | null;
  subscriptionRewardTokens?: number | string | null;
  eligibleDocumentTypes: string[];
}

export interface PremiumOverview {
  isActive: boolean;
  isPremium: boolean;
  premiumBadgeEnabled: boolean;
  featuredTripsEnabled: boolean;
  documentFundingEnabled: boolean;
  documentFundingLimit: number | null;
  documentFundingCurrency: string;
  subscriptionId: string | null;
  plan: SubscriptionPlan | null;
  endDate: string | null;
}

export interface Subscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  amount: number | string;
  currency: string;
  premiumBadgeEnabled: boolean;
  featuredTripsEnabled: boolean;
  documentFundingEnabled: boolean;
  documentFundingLimit: number | null;
  documentFundingCurrency: string;
  paymentReference?: string | null;
  paymentTransactionId?: string | null;
  isTrial: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPayment {
  transactionId: string | null;
  method: SubscriptionPaymentMethod | null;
  reference: string | null;
  orderNumber: string | null;
  status: SubscriptionPaymentStatus | null;
  statusCode: string | null;
  message: string | null;
  paymentUrl: string | null;
  amount: number;
  currency: string;
}

export interface SubscriptionPaymentResponse {
  subscription: Subscription;
  walletEntry?: WalletLedgerEntry | null;
  payment: SubscriptionPayment;
}

export type PaymentPurpose =
  | 'generic'
  | 'subscription_pro'
  | 'trip_booking'
  | 'wallet_top_up'
  | 'wallet_payout'
  | 'driver_payout'
  | 'referral_payout';

export interface PaymentHistoryItem {
  id: string;
  purpose: PaymentPurpose | string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  provider: 'flexpay' | string;
  method: SubscriptionPaymentMethod;
  status: SubscriptionPaymentStatus;
  reference: string;
  orderNumber: string | null;
  providerReference: string | null;
  statusCode: string | null;
  message: string | null;
  amount: number | string;
  currency: string;
  description: string | null;
  phone: string | null;
  paymentUrl: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscribeToProPayload {
  paymentMethod: SubscriptionPaymentMethod;
  phone?: string;
  approveUrl?: string;
  cancelUrl?: string;
  declineUrl?: string;
}
