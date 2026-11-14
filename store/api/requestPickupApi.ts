import { baseApi } from './baseApi';
import type { RequestPickupSummary } from '@/features/request-detail/requestPickupSummary';

export const requestPickupApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    getRequestPickupSummary: builder.query<RequestPickupSummary, string>({
      query: id => ({ url: `/trip-requests/${encodeURIComponent(id)}/pickup-summary`, timeout: 10000 }),
      keepUnusedDataFor: 0,
      providesTags: (_data, _error, id) => [{ type: 'TripRequest', id }],
    }),
  }),
});
export const { useGetRequestPickupSummaryQuery } = requestPickupApi;
