import type { RideDeclaration, RideSnapshot } from '@/features/ride-recovery/rideRecoveryModel';
import { baseApi } from './baseApi';

export const rideRecoveryApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    getRideDeclarations: builder.query<RideSnapshot[], { tripId?: string; bookingId?: string }>({
      query: ({ tripId, bookingId }) => `ride-declarations/${bookingId ? `booking/${bookingId}` : `trip/${tripId}`}`,
      transformResponse: (response: RideSnapshot | RideSnapshot[]) => Array.isArray(response) ? response : [response],
      keepUnusedDataFor: 60,
      providesTags: (_result, _error, { tripId, bookingId }) => [
        ...(bookingId ? [{ type: 'Booking' as const, id: bookingId }] : []),
        ...(tripId ? [{ type: 'Trip' as const, id: tripId }] : []),
        ...(_result ?? []).map(item => ({ type: 'Trip' as const, id: item.tripId })),
      ],
    }),
    declareRideStage: builder.mutation<RideSnapshot, RideDeclaration>({
      query: ({ bookingId, eventId, actorUserId, stage, decision, occurredAt, latitude, longitude, accuracy, arrivalPromptId }) => ({
        url: `ride-declarations/booking/${bookingId}`, method: 'PUT',
        body: { eventId, actorUserId, stage, decision, occurredAt, latitude, longitude, accuracy, arrivalPromptId },
      }),
      invalidatesTags: result => result && (result.pickup.status === 'confirmed' || result.dropoff.status === 'confirmed')
        ? [{ type: 'Booking', id: result.bookingId }, { type: 'Trip', id: result.tripId }, 'Booking'] : [],
    }),
  }),
});
export const { useGetRideDeclarationsQuery } = rideRecoveryApi;
