import { baseApi } from './baseApi';
import type { DriverOffer, TripRequest } from '@/types';
import type { ServerDriverOffer, ServerTripRequest } from './trip-request/serverTypes';
import { mapServerTripRequestToClient, mapServerDriverOfferToClient } from './trip-request/requestMapper';
import { tripRequestApi } from './tripRequestApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import type { RootState } from '@/store';
import { isRequestUnassigned } from '@/features/trip-request/requestExpiration';

export const counterOfferApi = baseApi.injectEndpoints({ endpoints: builder => ({
  proposeCounterOffer: builder.mutation<DriverOffer, { requestId: string; vehicleId: string; pricePerSeat: number }>({
    query: ({ requestId, ...body }) => ({ url: `/trip-requests/${requestId}/counter-offer`, method: 'POST', body, timeout: 15000 }),
    // Older servers omit the parent ID in a sanitized offer; the mutation URL is authoritative.
    transformResponse: (response: ServerDriverOffer, _meta, { requestId }) =>
      mapServerDriverOfferToClient({ ...response, tripRequestId: response.tripRequestId ?? requestId }),
    async onQueryStarted({ requestId }, { dispatch, getState, queryFulfilled }) {
      const version = getTokenSessionVersion();
      const userId = (getState() as RootState).auth.user?.id;
      try {
        const { data: offer } = await queryFulfilled;
        if (!userId || offer.driverId !== userId || offer.tripRequestId !== requestId ||
          version !== getTokenSessionVersion() || (getState() as RootState).auth.user?.id !== userId) return;
        dispatch(tripRequestApi.util.updateQueryData('getTripRequestById', requestId, request => {
          if (!isRequestUnassigned(request) || request.passengerId === userId) return;
          request.offers = [...(request.offers ?? []).filter(item => item.id !== offer.id), offer];
          request.status = 'offers_received';
        }));
      } catch { /* Never show a price as sent before the server confirms it. */ }
    },
    invalidatesTags: (_result, _error, { requestId }) => [{ type: 'TripRequest', id: requestId }, 'MyDriverOffers', 'AccountActivity', 'Notification'],
  }),
  declineCounterOffer: builder.mutation<TripRequest, { requestId: string; offerId: string }>({
    query: ({ requestId, offerId }) => ({ url: `/trip-requests/${requestId}/offers/${offerId}/reject`, method: 'POST', timeout: 15000 }),
    transformResponse: (response: ServerTripRequest) => mapServerTripRequestToClient(response),
    async onQueryStarted({ requestId }, { dispatch, getState, queryFulfilled }) {
      const version = getTokenSessionVersion();
      const userId = (getState() as RootState).auth.user?.id;
      try {
        const { data: request } = await queryFulfilled;
        if (!userId || request.id !== requestId || request.passengerId !== userId ||
          version !== getTokenSessionVersion() || (getState() as RootState).auth.user?.id !== userId) return;
        dispatch(tripRequestApi.util.updateQueryData('getTripRequestById', requestId, current => {
          if (!isRequestUnassigned(current) && isRequestUnassigned(request)) return;
          return request;
        }));
      } catch { /* Refetch handles uncertain results; keep the pending offer on failure. */ }
    },
    invalidatesTags: (_result, _error, { requestId }) => [{ type: 'TripRequest', id: requestId }, 'MyTripRequests', 'AccountActivity', 'Notification'],
  }),
}) });
export const { useProposeCounterOfferMutation, useDeclineCounterOfferMutation } = counterOfferApi;
