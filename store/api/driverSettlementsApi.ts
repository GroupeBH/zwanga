import type {
  DriverEarning,
  DriverPayout,
  DriverSettlementSummary,
  DriverTripRevenueSummary,
} from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

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
    requestDriverPayout: builder.mutation<DriverPayout, RequestDriverPayoutPayload>({
      query: (body) => ({
        url: '/driver-settlements/payouts',
        method: 'POST',
        body,
      }),
      invalidatesTags: [settlementTag],
    }),
    checkDriverPayoutStatus: builder.query<DriverPayout, string>({
      query: (orderNumber) => `/driver-settlements/payouts/${encodeURIComponent(orderNumber)}/status`,
      providesTags: [settlementTag],
    }),
  }),
});

export const {
  useGetMyDriverSettlementQuery,
  useGetMyDriverEarningsQuery,
  useLazyGetDriverTripRevenueSummaryQuery,
  useGetMyDriverPayoutsQuery,
  useRequestDriverPayoutMutation,
  useLazyCheckDriverPayoutStatusQuery,
} = driverSettlementsApi;
