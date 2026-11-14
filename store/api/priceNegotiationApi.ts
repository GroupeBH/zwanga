import { baseApi } from './baseApi';
import type { TripRequest } from '@/types';
import type { ServerTripRequest } from './trip-request/serverTypes';
import { mapServerTripRequestToClient } from './trip-request/requestMapper';
import type { PriceAlternatives } from '@/features/request-detail/priceNegotiation';

type OfferKey = { requestId: string; offerId: string };
const tags = (_result: unknown, _error: unknown, { requestId }: OfferKey) => [
  { type: 'TripRequest' as const, id: requestId }, 'MyTripRequests' as const,
  'MyDriverOffers' as const, 'AccountActivity' as const, 'Notification' as const,
];
export const priceNegotiationApi = baseApi.injectEndpoints({ endpoints: builder => ({
  negotiateRequestPrice: builder.mutation<TripRequest, OfferKey & { pricePerSeat: number; stage: 'passenger_counter' | 'driver_final' }>({
    query: ({ requestId, offerId, pricePerSeat, stage }) => ({
      url: `/trip-requests/${requestId}/offers/${offerId}/${stage === 'passenger_counter' ? 'passenger-price' : 'final-price'}`,
      method: 'POST', body: { pricePerSeat }, timeout: 15000,
    }), transformResponse: (data: ServerTripRequest) => mapServerTripRequestToClient(data), invalidatesTags: tags,
  }),
  acceptPassengerPrice: builder.mutation<TripRequest, OfferKey>({
    query: ({ requestId, offerId }) => ({ url: `/trip-requests/${requestId}/offers/${offerId}/accept-passenger-price`, method: 'POST', timeout: 15000 }),
    transformResponse: (data: ServerTripRequest) => mapServerTripRequestToClient(data), invalidatesTags: tags,
  }),
  getPriceAlternatives: builder.query<PriceAlternatives, OfferKey>({
    query: ({ requestId, offerId }) => ({ url: `/trip-requests/${requestId}/offers/${offerId}/alternatives`, timeout: 10000 }),
    keepUnusedDataFor: 0,
  }),
}) });
export const { useNegotiateRequestPriceMutation, useAcceptPassengerPriceMutation, useGetPriceAlternativesQuery } = priceNegotiationApi;
