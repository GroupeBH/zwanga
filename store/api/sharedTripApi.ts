import { baseApi } from './baseApi';
import { CRITICAL_MUTATION_TIMEOUT_MS } from '@/constants/network';

export interface SharedTripContext {
  hasOngoingTrip: boolean;
  trip: { id: string; availableSeats: number; pricePerSeat: number; arrivalLocation: string } | null;
  reason: string | null;
}
export interface SharedTripOffer {
  id: string; existingTripId?: string | null; status: string; pricePerSeat: number;
  requiresPassengerKyc?: boolean; driver: { firstName: string; lastName: string };
}
export const sharedTripApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    sharedTripContext: builder.query<SharedTripContext, string>({
      query: id => `/trip-requests/${id}/shared-offers/context`,
      providesTags: (_r, _e, id) => [{ type: 'TripRequest', id }, { type: 'Trip', id: 'LIST' }],
    }),
    sharedTripOffers: builder.query<SharedTripOffer[], string>({
      query: id => `/trip-requests/${id}/offers`,
      transformResponse: (offers: SharedTripOffer[]) => offers.filter(offer => Boolean(offer.existingTripId) && offer.status === 'pending'),
      providesTags: (_r, _e, id) => [{ type: 'TripRequest', id }],
    }),
    proposeSharedTrip: builder.mutation<{ offerId: string }, { requestId: string; tripId: string }>({
      query: ({ requestId, tripId }) => ({ url: `/trip-requests/${requestId}/shared-offers`, method: 'POST',
        body: { tripId }, timeout: CRITICAL_MUTATION_TIMEOUT_MS }),
      invalidatesTags: (_r, _e, { requestId }) => [{ type: 'TripRequest', id: requestId }, 'DriverOffer'],
    }),
    decideSharedTrip: builder.mutation<{ tripId?: string; bookingId?: string; status: string },
      { requestId: string; offerId: string; accept: boolean }>({
      query: ({ requestId, offerId, accept }) => ({
        url: `/trip-requests/${requestId}/shared-offers/${offerId}/${accept ? 'accept' : 'decline'}`,
        method: 'POST', ...(accept ? { body: { consent: true } } : {}), timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      invalidatesTags: (_r, _e, { requestId }) => [{ type: 'TripRequest', id: requestId },
        'TripRequest', 'Trip', 'Booking', 'DriverOffer'],
    }),
  }),
});
export const { useSharedTripContextQuery, useSharedTripOffersQuery,
  useProposeSharedTripMutation, useDecideSharedTripMutation } = sharedTripApi;
