import { baseApi } from './baseApi';
import type { DriverOffer, TripRequest } from '@/types';
import type { ServerDriverOffer, ServerTripRequest } from './trip-request/serverTypes';
import { mapServerTripRequestToClient, mapServerDriverOfferToClient } from './trip-request/requestMapper';

export const counterOfferApi = baseApi.injectEndpoints({ endpoints: builder => ({
  proposeCounterOffer: builder.mutation<DriverOffer, { requestId: string; vehicleId: string; pricePerSeat: number }>({
    query: ({ requestId, ...body }) => ({ url: `/trip-requests/${requestId}/counter-offer`, method: 'POST', body, timeout: 15000 }),
    transformResponse: (response: ServerDriverOffer) => mapServerDriverOfferToClient(response),
    invalidatesTags: (_result, _error, { requestId }) => [{ type: 'TripRequest', id: requestId }, 'MyDriverOffers', 'AccountActivity', 'Notification'],
  }),
  declineCounterOffer: builder.mutation<TripRequest, { requestId: string; offerId: string }>({
    query: ({ requestId, offerId }) => ({ url: `/trip-requests/${requestId}/offers/${offerId}/reject`, method: 'POST', timeout: 15000 }),
    transformResponse: (response: ServerTripRequest) => mapServerTripRequestToClient(response),
    invalidatesTags: (_result, _error, { requestId }) => [{ type: 'TripRequest', id: requestId }, 'MyTripRequests', 'AccountActivity', 'Notification'],
  }),
}) });
export const { useProposeCounterOfferMutation, useDeclineCounterOfferMutation } = counterOfferApi;
