import type { BaseEndpointBuilder } from '../types';

export type CoPassenger = { id: string; userId?: string | null; firstName: string; avatarUrl: string | null; seats: number };
export type TripCoPassengers = { tripId: string; participants: CoPassenger[] };
// Account/session belong to the cache key, never to the server's authorization parameters.
export type CoPassengersQuery = { tripId: string; viewerId: string; session: number };

export function buildTripCoPassengers(builder: BaseEndpointBuilder) {
  return {
    getTripCoPassengers: builder.query<TripCoPassengers, CoPassengersQuery>({
      query: ({ tripId }) => `/trips/${encodeURIComponent(tripId)}/co-passengers`,
      keepUnusedDataFor: 0,
      transformResponse: (response: TripCoPassengers) => ({
        tripId: response.tripId,
        // Keep a deliberately separate type from the driver's private booking data.
        participants: response.participants.map(({ id, userId, firstName, avatarUrl, seats }) => ({ id, userId: userId ?? null, firstName, avatarUrl, seats })),
      }),
      providesTags: (_result, _error, { tripId }) => [{ type: 'Trip', id: tripId }, { type: 'Booking', id: 'LIST' }],
    }),
  };
}
