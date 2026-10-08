import { baseApi } from './baseApi';
import type { TripPaymentMode } from '@/types';

export interface DriverFinanceSummary {
  commissionRate: number; cashCommissionRate?: number; proPrice: number; currency: string; durationDays: number;
  pro: { isActive: boolean; endDate: string | null };
  trial: { startDate: string; endDate: string } | null;
  cash: { enabled: boolean; availableTokens: number; reservedTokens: number; debtTokens: number;
    debtLimitTokens?: number; availableCreditTokens?: number; debtAmount?: number;
    moneyPerToken: number; coverageAmount: number; blocked: boolean; purchasedTokensOnly: boolean };
}
export interface TripPaymentOptions {
  acceptedPaymentModes: TripPaymentMode[]; availablePaymentModes: TripPaymentMode[];
  cashUnavailableReason: string | null; commissionRate: number;
}
export const driverFinanceApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    driverFinanceSummary: builder.query<DriverFinanceSummary, string>({
      query: () => '/driver-finance/me', providesTags: ['Wallet', 'Subscription', 'Booking', 'MyDriverOffers'], keepUnusedDataFor: 0,
    }),
    tripPaymentOptions: builder.query<TripPaymentOptions, { tripId: string; numberOfSeats: number }>({
      query: ({ tripId, numberOfSeats }) => ({ url: `/driver-finance/trips/${tripId}/payment-options`, params: { numberOfSeats } }),
      providesTags: ['Trip', 'Booking', 'Wallet'], keepUnusedDataFor: 0,
    }),
    bookingPaymentOptions: builder.query<TripPaymentOptions, string>({
      query: id => `/driver-finance/bookings/${id}/payment-options`, providesTags: ['Booking', 'Wallet'], keepUnusedDataFor: 0,
    }),
  }),
});
export const { useDriverFinanceSummaryQuery, useLazyDriverFinanceSummaryQuery, useTripPaymentOptionsQuery, useLazyTripPaymentOptionsQuery, useBookingPaymentOptionsQuery } = driverFinanceApi;
