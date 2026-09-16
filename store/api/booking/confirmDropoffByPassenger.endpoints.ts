import { bookingListTag, tripListTag, myTripsListTag } from './cachePolicy';
import { mapServerBookingToClient } from './bookingMapper';
import { ServerBooking, UpdatePassengerLocationResponse } from './serverTypes';
import type { Booking, TripPaymentMode, TripInterruptionReason } from '../../../types';
import type { BaseEndpointBuilder } from '../types';
import { CRITICAL_MUTATION_TIMEOUT_MS } from '@/constants/network';

export function buildConfirmDropoffByPassengerEndpoints(builder: BaseEndpointBuilder) {
  return {
// Signaler l'arrivée du passager (par le passager)
    confirmDropoffByPassenger: builder.mutation<Booking, string | { id: string; paymentMode?: TripPaymentMode }>({
      query: (arg: string | { id: string; paymentMode?: TripPaymentMode }) => {
        const id = typeof arg === 'string' ? arg : arg.id;
        const paymentMode = typeof arg === 'string' ? undefined : arg.paymentMode;
        return {
          url: `/bookings/${id}/confirm-dropoff-passenger`,
          method: 'PUT',
          body: paymentMode ? { paymentMode } : {},
          timeout: CRITICAL_MUTATION_TIMEOUT_MS,
        };
      },
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      invalidatesTags: (result) =>
        result
          ? [
              { type: 'Booking', id: result.id },
              { type: 'Trip', id: result.tripId },
              bookingListTag,
              tripListTag,
              myTripsListTag,
            ]
          : [bookingListTag, tripListTag, myTripsListTag],
    }),
requestPassengerTripInterruption: builder.mutation<
      Booking,
      {
        bookingId: string;
        reason: TripInterruptionReason;
        note?: string;
        coordinates?: { latitude: number; longitude: number } | null;
      }
    >({
      query: ({ bookingId, ...body }) => ({
        url: `/bookings/${bookingId}/interruption-request`,
        method: 'POST',
        body,
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      invalidatesTags: (result, _error, { bookingId }) => [
        { type: 'Booking', id: result?.id ?? bookingId },
        ...(result?.tripId ? [{ type: 'Trip' as const, id: result.tripId }] : []),
        bookingListTag,
        tripListTag,
        myTripsListTag,
      ],
    }),
cancelPassengerTripInterruption: builder.mutation<Booking, string>({
      query: (bookingId: string) => ({
        url: `/bookings/${bookingId}/interruption-request/cancel`,
        method: 'PUT',
        body: {},
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      invalidatesTags: (result, _error, bookingId) => [
        { type: 'Booking', id: result?.id ?? bookingId },
        ...(result?.tripId ? [{ type: 'Trip' as const, id: result.tripId }] : []),
        bookingListTag,
        tripListTag,
        myTripsListTag,
      ],
    }),
confirmPassengerTripInterruption: builder.mutation<Booking, string>({
      query: (bookingId: string) => ({
        url: `/bookings/${bookingId}/interruption-request/confirm`,
        method: 'PUT',
        body: {},
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      invalidatesTags: (result, _error, bookingId) => [
        { type: 'Booking', id: result?.id ?? bookingId },
        ...(result?.tripId ? [{ type: 'Trip' as const, id: result.tripId }] : []),
        bookingListTag,
        tripListTag,
        myTripsListTag,
      ],
    }),
rejectPassengerTripInterruption: builder.mutation<Booking, { bookingId: string; reason?: string }>({
      query: ({ bookingId, reason }) => ({
        url: `/bookings/${bookingId}/interruption-request/reject`,
        method: 'PUT',
        body: reason ? { reason } : {},
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      invalidatesTags: (result, _error, { bookingId }) => [
        { type: 'Booking', id: result?.id ?? bookingId },
        ...(result?.tripId ? [{ type: 'Trip' as const, id: result.tripId }] : []),
        bookingListTag,
        tripListTag,
        myTripsListTag,
      ],
    }),
updatePassengerLocation: builder.mutation<
      UpdatePassengerLocationResponse,
      {
        bookingId: string;
        latitude: number;
        longitude: number;
        accuracy?: number;
        speed?: number;
        heading?: number;
        recordedAt?: string;
      }
    >({
      query: ({ bookingId, latitude, longitude, accuracy, speed, heading, recordedAt }) => ({
        url: `/bookings/${bookingId}/passenger-location`,
        method: 'PUT',
        body: {
          latitude,
          longitude,
          accuracy,
          speed,
          heading,
          recordedAt,
        },
      }),
      invalidatesTags: (result, _error, { bookingId }) =>
        result?.autoProgress?.events.length
          ? [
              { type: 'Booking' as const, id: bookingId },
              bookingListTag,
              tripListTag,
              myTripsListTag,
              ...result.autoProgress.events.map((event) => ({
                type: 'Booking' as const,
                id: event.bookingId,
              })),
              ...result.autoProgress.events.map((event) => ({
                type: 'Trip' as const,
                id: event.tripId,
              })),
            ]
          : [],
    })
  };
}
