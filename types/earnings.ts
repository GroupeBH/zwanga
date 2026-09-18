import type { TripPaymentMode } from './common';

export type DriverEarningStatus = 'available' | 'paid' | 'cancelled';

export type DriverPayoutStatus = 'pending' | 'initiated' | 'succeeded' | 'failed' | 'cancelled';

export interface DriverEarning {
  id: string;
  bookingId: string;
  tripId: string;
  driverId: string;
  passengerId: string;
  paymentMode: TripPaymentMode;
  grossAmount: number | string;
  commissionRate: number | string;
  commissionAmount: number | string;
  netAmount: number | string;
  currency: string;
  status: DriverEarningStatus;
  availableAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriverPayout {
  id: string;
  driverId: string;
  idempotencyKey: string;
  amount: number | string;
  currency: string;
  phone: string;
  status: DriverPayoutStatus;
  paymentTransactionId?: string | null;
  orderNumber?: string | null;
  paymentMessage?: string | null;
  requestedAt?: string | null;
  processedAt?: string | null;
  failureReason?: string | null;
  reference?: string | null;
  requiresReview?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DriverSettlementSummary {
  availableBalance: number;
  pendingPayoutBalance: number;
  paidBalance: number;
  currency: string;
  commissionRate: number;
  kycApproved: boolean;
  payoutPhone: string | null;
  minimumPayoutAmount: number;
}

export interface DriverTripRevenueSummary {
  tripId: string;
  currency: string;
  commissionRate: number;
  confirmedAmount: number;
  /** Only true when confirmedAmount was read from the persisted earnings ledger. */
  ledgerVerified?: boolean;
  creditPendingAmount?: number;
  zwangaSubsidyAmount?: number;
  cashToCollectAmount: number;
  electronicPendingAmount: number;
  totalExpectedAmount: number;
  completedBookings: number;
  generatedAt: string;
}
