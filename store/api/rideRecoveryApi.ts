import type { RideDeclaration, RideSnapshot } from '@/features/ride-recovery/rideRecoveryModel';
import { baseApi } from './baseApi';

export const rideRecoveryApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    getRideDeclarations: builder.query<RideSnapshot[], { tripId?: string; bookingId?: string }>({
      query: ({ tripId, bookingId }) => `ride-declarations/${bookingId ? `booking/${bookingId}` : `trip/${tripId}`}`,
      transformResponse: (response: RideSnapshot | RideSnapshot[]) => Array.isArray(response) ? response : [response],
      keepUnusedDataFor: 60,
    }),
    declareRideStage: builder.mutation<RideSnapshot, RideDeclaration>({
      query: ({ bookingId, eventId, actorUserId, stage, decision, occurredAt, latitude, longitude, accuracy }) => ({
        url: `ride-declarations/booking/${bookingId}`, method: 'PUT',
        body: { eventId, actorUserId, stage, decision, occurredAt, latitude, longitude, accuracy },
      }),
      invalidatesTags: result => result && (result.pickup.status === 'confirmed' || result.dropoff.status === 'confirmed')
        ? [{ type: 'Booking', id: result.bookingId }, { type: 'Trip', id: result.tripId }, 'Booking'] : [],
    }),
  }),
});
export const { useGetRideDeclarationsQuery } = rideRecoveryApi;
