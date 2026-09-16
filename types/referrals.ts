export type ReferralRewardStatus = 'pending' | 'available' | 'reversed';

export type ReferralWithdrawalStatus =
  | 'pending'
  | 'initiated'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface ReferralSummary {
  code: string;
  shareLink: string;
  referralCount: number;
  rewardCount: number;
  attribution: {
    hasReferrer: boolean;
    referredAt: string | null;
  };
  balances: {
    pendingTokens: number;
    availableTokens: number;
    reservedTokens: number;
    withdrawnTokens: number;
    currency: string;
    availableAmount: number;
    payoutCurrency: string;
  };
  withdrawal: {
    kycApproved: boolean;
    minimumTokens: number;
    moneyPerToken: number;
    currency: string;
  };
  rules: {
    rewardRate: number;
    eligiblePayments: string[];
    holdDays: number;
    rewardWindowMonths: number;
    rewardWindowStartsAt: string;
    promotionalTokensWithdrawable: boolean;
  };
}

export interface ReferredUserSummary {
  userId: string;
  firstName: string;
  lastNameInitial: string;
  referredAt: string | null;
  qualifiedAt: string | null;
  rewardWindowEndsAt: string | null;
  earnings: {
    rewardCount: number;
    earnedTokens: number;
    pendingTokens: number;
    releasedTokens: number;
    reversedTokens: number;
    earnedAmount: number;
    currency: string;
  };
}

export interface ReferralReward {
  id: string;
  sourceType: 'subscription_payment' | 'booking_payment';
  sourceEntityId: string;
  grossAmount: number | string;
  sourceCurrency: string;
  rate: number | string;
  rewardAmount: number | string;
  rewardTokens: number | string;
  status: ReferralRewardStatus;
  holdUntil: string;
  availableAt: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
  referredUser: {
    firstName: string;
    lastNameInitial: string;
  };
}

export interface ReferralLedgerEntry {
  id: string;
  type:
    | 'reward_pending'
    | 'reward_released'
    | 'reward_reversed'
    | 'withdrawal_reserved'
    | 'withdrawal_succeeded'
    | 'withdrawal_refunded';
  bucket: 'pending' | 'available' | 'reserved' | 'withdrawn';
  amountTokens: number | string;
  balanceAfter: number | string;
  description: string;
  rewardId: string | null;
  withdrawalId: string | null;
  paymentTransactionId: string | null;
  createdAt: string;
}

export interface ReferralWithdrawal {
  id: string;
  tokens: number | string;
  amount: number | string;
  currency: string;
  moneyPerToken: number | string;
  phone: string;
  status: ReferralWithdrawalStatus;
  paymentTransactionId: string | null;
  orderNumber?: string | null;
  paymentMessage?: string | null;
  requestedAt: string;
  processedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}
