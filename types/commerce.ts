export interface CommercePlan { id: string; period: 'week' | 'month'; count: number }
export interface CommercePrices { creditTotalMinor: string; cashTotalMinor: string; cashSavingMinor: string; depositMinor: string; plans: CommercePlan[] }
export interface CommerceProduct {
  id: string; name: string; description: string; kind: string; categoryId: string; revision: number; currency: 'CDF';
  details: { brand?: string; model?: string; specifications?: string; warranty?: string; imageUrl?: string; requiredEvidence: string[]; vehicleTypes: string[]; processingDays: number };
  prices: CommercePrices; terms?: string; delivery?: string;
  repayment?: { netIncomeBps: number; fixedPerTripMinor: string; commissionShareBps: number };
}
export interface CommerceQuote extends CommercePrices {
  mode: 'cash' | 'credit'; planId: string | null; quoteHash: string; totalMinor: string; principalMinor: string;
  installments: number; period: 'week' | 'month'; installmentAmountsMinor: string[]; beforeDeliveryMinor: string;
}
export interface CommerceCategory { id: string; code: string; name: string; kind: string }
export interface CommercePage<T> { items: T[]; nextCursor: string | null }
export interface CommerceInstallment { ordinal: number; dueAt: string; amountMinor: string; remainingMinor: string; overdueDays: number }
export interface CommerceContract {
  id: string; label: string; status: string; principalMinor: string; paidMinor: string; creditedMinor?: string;
  remainingMinor?: string; discountMinor?: string; depositMinor: string; depositPaidMinor: string; termsHash: string;
  mandateUntil: string | null; deliveryState: string; installments: CommerceInstallment[];
  snapshot: { purchase?: CommerceQuote; product: CommerceProduct; policy: { terms: string; rules: { netIncomeBps: number; fixedPerTripMinor: string } } };
}
