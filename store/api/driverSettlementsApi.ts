import type {
  DriverEarning,
  DriverPayout,
  DriverSettlementSummary,
  DriverTripRevenueSummary,
  DriverBookingRevenueSummary,
} from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';
import { CRITICAL_MUTATION_TIMEOUT_MS } from '@/constants/network';

type RequestDriverPayoutPayload = {
  amount: number;
  phone?: string;
  idempotencyKey: string;
};

const settlementTag = { type: 'DriverSettlement' as const, id: 'ME' };

export const driverSettlementsApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    getMyDriverSettlement: builder.query<DriverSettlementSummary, void>({
      query: () => '/driver-settlements/me',
      providesTags: [settlementTag],
    }),
    getMyDriverEarnings: builder.query<DriverEarning[], void>({
      query: () => '/driver-settlements/earnings',
      providesTags: [settlementTag],
    }),
    getDriverTripRevenueSummary: builder.query<DriverTripRevenueSummary, string>({
      query: (tripId) =>
        `/driver-settlements/trips/${encodeURIComponent(tripId)}/revenue-summary`,
      providesTags: (_result, _error, tripId) => [
        settlementTag,
        { type: 'DriverSettlement' as const, id: `TRIP-${tripId}` },
      ],
    }),
    getMyDriverPayouts: builder.query<DriverPayout[], void>({
      query: () => '/driver-settlements/payouts',
      providesTags: [settlementTag],
    }),
    getDriverBookingRevenueSummary: builder.query<DriverBookingRevenueSummary, string>({
      query: bookingId => `/driver-settlements/bookings/${encodeURIComponent(bookingId)}/revenue-summary`,
      providesTags: (_result, _error, bookingId) => [settlementTag, { type: 'Booking', id: bookingId }],
      keepUnusedDataFor: 60,
    }),
    requestDriverPayout: builder.mutation<DriverPayout, RequestDriverPayoutPayload>({
      query: (body) => ({
        url: '/driver-settlements/payouts',
        method: 'POST',
        body,
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      invalidatesTags: [settlementTag],
    }),
    checkDriverPayoutStatus: builder.query<DriverPayout, string>({
      query: (orderNumber) => ({
        url: `/driver-settlements/payouts/${encodeURIComponent(orderNumber)}/status`,
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      providesTags: [settlementTag],
    }),
  }),
});

export const {
  useGetMyDriverSettlementQuery,
  useGetMyDriverEarningsQuery,
  useLazyGetDriverTripRevenueSummaryQuery,
  useGetDriverBookingRevenueSummaryQuery,
  useGetMyDriverPayoutsQuery,
  useRequestDriverPayoutMutation,
  useLazyCheckDriverPayoutStatusQuery,
} = driverSettlementsApi;
