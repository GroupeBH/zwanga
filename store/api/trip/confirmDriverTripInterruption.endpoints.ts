import { cleanObject, tripListTag, myTripsListTag, DriverEmergencyContactsResponse } from './contracts';
import { mapServerTripToClient } from './tripMapper';
import { ServerTrip } from './serverTypes';
import type { Trip } from '../../../types';
import type { BookingAutoProgressPayload } from '@/services/trackingSocket';
import { CRITICAL_MUTATION_TIMEOUT_MS } from '@/constants/network';
import type { BaseEndpointBuilder } from '../types';

export function buildConfirmDriverTripInterruptionEndpoints(builder: BaseEndpointBuilder) {
  return {
confirmDriverTripInterruption: builder.mutation<
      Trip,
      { tripId: string; bookingId?: string }
    >({
      query: ({ tripId, bookingId }) => ({
        url: `/trips/${tripId}/interruption-request/confirm`,
        method: 'PUT',
        body: bookingId ? { bookingId } : {},
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      invalidatesTags: (_result, _error, { tripId }) => [
        'Booking',
        { type: 'Trip', id: tripId },
        { type: 'MyTrips', id: tripId },
        tripListTag,
        myTripsListTag,
      ],
    }),
rejectDriverTripInterruption: builder.mutation<
      Trip,
      { tripId: string; bookingId?: string; reason?: string }
    >({
      query: ({ tripId, bookingId, reason }) => ({
        url: `/trips/${tripId}/interruption-request/reject`,
        method: 'PUT',
        body: cleanObject({ bookingId, reason }),
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      invalidatesTags: (_result, _error, { tripId }) => [
        { type: 'Trip', id: tripId },
        { type: 'MyTrips', id: tripId },
        tripListTag,
        myTripsListTag,
      ],
    }),
// Terminer un trajet actif
    completeTrip: builder.mutation<Trip, string>({
      query: (id: string) => ({
        url: `/trips/${id}/complete`,
        method: 'PUT',
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      invalidatesTags: (_result, _error, id: string) => [
        { type: 'Trip', id },
        { type: 'MyTrips', id },
        tripListTag,
        myTripsListTag,
      ],
    }),
// Mettre à jour la position du conducteur
    updateDriverLocation: builder.mutation<
      {
        tripId: string;
        coordinates: [number, number];
        updatedAt: string;
        autoProgress?: BookingAutoProgressPayload;
      },
      {
        tripId: string;
        coordinates: [number, number];
        accuracy?: number;
        speed?: number;
        heading?: number;
        recordedAt?: string;
      }
    >({
      query: ({ tripId, coordinates, accuracy, speed, heading, recordedAt }) => ({
        url: `/trips/${tripId}/driver-location`,
        method: 'PUT',
        body: { coordinates, accuracy, speed, heading, recordedAt },
      }),
      invalidatesTags: (result, _error, { tripId }) =>
        result?.autoProgress?.events.length
          ? [
              { type: 'Trip' as const, id: tripId },
              { type: 'Trip' as const, id: 'LIST' },
              { type: 'Booking' as const, id: 'LIST' },
              ...result.autoProgress.events
                .filter((event) => Boolean(event.bookingId))
                .map((event) => ({ type: 'Booking' as const, id: event.bookingId! })),
            ]
          : [],
    }),
// Obtenir la position du conducteur pour un utilisateur
    getDriverLocation: builder.query<
      { tripId: string; coordinates: [number, number] | null; updatedAt: string | null },
      string
    >({
      query: (tripId: string) => `/trips/${tripId}/driver-location`,
      providesTags: (_result, _error, tripId: string) => [{ type: 'Trip', id: tripId }],
    }),
// Réserver des places sur un trajet
    bookTrip: builder.mutation<void, { tripId: string; seats: number }>({
      query: ({ tripId, seats }: { tripId: string; seats: number }) => ({
        url: `/trips/${tripId}/book`,
        method: 'POST',
        body: { seats },
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      invalidatesTags: (_result, _error, { tripId }: { tripId: string }) => [
        { type: 'Trip', id: tripId },
        tripListTag,
      ],
    }),
setDriverEmergencyContacts: builder.mutation<
      DriverEmergencyContactsResponse,
      { tripId: string; emergencyContactIds: string[] }
    >({
      query: ({ tripId, emergencyContactIds }) => ({
        url: `/trips/${tripId}/driver-emergency-contacts`,
        method: 'PUT',
        body: { emergencyContactIds },
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      invalidatesTags: (_result, _error, { tripId }) => [
        { type: 'Trip', id: tripId },
        { type: 'MyTrips', id: tripId },
        myTripsListTag,
      ],
    })
  };
}
