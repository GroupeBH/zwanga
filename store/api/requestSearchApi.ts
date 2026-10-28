import { baseApi } from './baseApi';
import type { RequestSearchSnapshot } from '@/features/request-detail/requestSearchModel';

export const requestSearchApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    getRequestSearchMap: builder.query<RequestSearchSnapshot, string>({
      query: id => ({ url: `/trip-requests/${encodeURIComponent(id)}/search-map`, timeout: 10000 }),
      keepUnusedDataFor: 15,
      providesTags: (_data, _error, id) => [{ type: 'TripRequest', id }],
    }),
  }),
});
export const { useGetRequestSearchMapQuery } = requestSearchApi;
