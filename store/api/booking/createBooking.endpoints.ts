import {
  bookingListTag,
  tripListTag,
  myTripsListTag,
  walletTag,
  driverSettlementTag,
  paymentHistoryTag,
} from './cachePolicy';
import { mapServerBookingToClient } from './bookingMapper';
import { ServerBooking } from './serverTypes';
import type {
  Booking,
  BookingPaymentResponse,
  BookingStatus,
  SubscriptionPaymentMethod,
  TripPaymentMode,
  WhatsAppNotificationData,
} from '../../../types';
import type { BaseEndpointBuilder } from '../types';
import { CRITICAL_MUTATION_TIMEOUT_MS } from '@/constants/network';

export function buildCreateBookingEndpoints(builder: BaseEndpointBuilder) {
  return {
    getMyActivityBookings: builder.query<Booking[], void>({
      query: () => ({ url: '/bookings/my-bookings', params: { scope: 'activity' } }),
      transformResponse: (response: ServerBooking[]) => response.map(mapServerBookingToClient),
      providesTags: result => [...(result ?? []).map(({ id }) => ({ type: 'Booking' as const, id })), bookingListTag],
    }),
createBooking: builder.mutation<
      Booking,
      {
        tripId: string;
        numberOfSeats: number;
        passengerOrigin?: string;
        passengerOriginReference?: string;
        passengerOriginCoordinates?: { latitude: number; longitude: number };
        passengerDestination?: string;
        passengerDestinationReference?: string;
        passengerDestinationCoordinates?: {
          latitude: number;
          longitude: number;
        };
        paymentMode?: TripPaymentMode;
      }
    >({
      query: (body) => ({
        url: '/bookings',
        method: 'POST',
        body,
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      invalidatesTags: (_result, _error, { tripId }) => [
        bookingListTag,
        { type: 'Trip' as const, id: tripId },
        tripListTag,
        myTripsListTag,
      ],
    }),
getMyBookings: builder.query<Booking[], void>({
      query: () => '/bookings/my-bookings',
      transformResponse: (response: ServerBooking[]) => response.map((booking) => mapServerBookingToClient(booking)),
      providesTags: (result) =>
        result ? [...result.map(({ id }) => ({ type: 'Booking' as const, id })), bookingListTag] : [bookingListTag],
    }),
getTripBookings: builder.query<Booking[], string>({
      query: (tripId: string) => `/bookings/trip/${tripId}`,
      transformResponse: (response: ServerBooking[]) => response.map((booking) => mapServerBookingToClient(booking)),
      providesTags: (result: Booking[] | undefined, _error: unknown, arg: string) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Booking' as const, id })), { type: 'Trip', id: arg }, bookingListTag]
          : [{ type: 'Trip', id: arg }, bookingListTag],
    }),
initiateBookingPayment: builder.mutation<
      BookingPaymentResponse,
      {
        bookingId: string;
        method: SubscriptionPaymentMethod;
        phone?: string;
        approveUrl?: string;
        cancelUrl?: string;
        declineUrl?: string;
      }
    >({
      query: ({ bookingId, ...body }) => ({
        url: `/bookings/${bookingId}/pay`,
        method: 'POST',
        body,
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      invalidatesTags: (_result, _error, { bookingId }) => [
        { type: 'Booking', id: bookingId },
        bookingListTag,
        walletTag,
        driverSettlementTag,
        paymentHistoryTag,
      ],
    }),
updateBookingPaymentMode: builder.mutation<Booking, { bookingId: string; paymentMode: TripPaymentMode }>({
      query: ({ bookingId, paymentMode }) => ({
        url: `/bookings/${bookingId}/payment-mode`,
        method: 'PUT',
        body: { paymentMode },
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      invalidatesTags: (result, _error, { bookingId }) => [
        { type: 'Booking', id: result?.id ?? bookingId },
        bookingListTag,
        walletTag,
        driverSettlementTag,
        paymentHistoryTag,
      ],
    }),
checkBookingPaymentStatus: builder.query<BookingPaymentResponse, string>({
      query: (orderNumber) => `/bookings/payments/${orderNumber}/status`,
      providesTags: (result) =>
        result?.booking?.id ? [{ type: 'Booking', id: result.booking.id }, bookingListTag] : [bookingListTag],
    }),
getBookingById: builder.query<Booking, string>({
      query: (id: string) => `/bookings/${id}`,
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      providesTags: (_result: Booking | undefined, _error: unknown, id: string) => [{ type: 'Booking', id }],
    }),
updateBookingStatus: builder.mutation<Booking, { id: string; status: BookingStatus; rejectionReason?: string }>({
      query: ({ id, ...body }: { id: string; status: BookingStatus; rejectionReason?: string }) => ({
        url: `/bookings/${id}/status`,
        method: 'PUT',
        body,
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      invalidatesTags: (result) =>
        result
          ? [{ type: 'Booking', id: result.id }, { type: 'Trip', id: result.tripId }, bookingListTag, tripListTag]
          : [bookingListTag, tripListTag],
    }),
cancelBooking: builder.mutation<void, string>({
      query: (id: string) => ({
        url: `/bookings/${id}/cancel`,
        method: 'PUT',
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      invalidatesTags: (_result, _error, id: string) => [
        { type: 'Booking', id },
        bookingListTag,
        tripListTag,
        myTripsListTag,
      ],
    }),
rejectBooking: builder.mutation<Booking, { id: string; reason: string }>({
      query: ({ id, reason }: { id: string; reason: string }) => ({
        url: `/bookings/${id}/reject`,
        method: 'PUT',
        body: { reason },
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
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
getWhatsAppNotificationData: builder.mutation<
      WhatsAppNotificationData,
      { bookingId: string; emergencyContactIds: string[] }
    >({
      query: ({ bookingId, emergencyContactIds }: { bookingId: string; emergencyContactIds: string[] }) => ({
        url: `/bookings/${bookingId}/whatsapp-notification-data`,
        method: 'POST',
        body: { emergencyContactIds },
      }),
    }),
setBookingEmergencyContacts: builder.mutation<
      WhatsAppNotificationData,
      { bookingId: string; emergencyContactIds: string[] }
    >({
      query: ({ bookingId, emergencyContactIds }: { bookingId: string; emergencyContactIds: string[] }) => ({
        url: `/bookings/${bookingId}/whatsapp-notification-data`,
        method: 'POST',
        body: { emergencyContactIds },
      }),
      invalidatesTags: (_result, _error, { bookingId }) => [{ type: 'Booking', id: bookingId }, bookingListTag],
    }),
// Confirmer la récupération du passager (par le driver)
    confirmPickup: builder.mutation<Booking, string>({
      query: (id: string) => ({
        url: `/bookings/${id}/confirm-pickup`,
        method: 'PUT',
        body: {},
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
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
// Confirmer la récupération du passager (par le passager)
    confirmPickupByPassenger: builder.mutation<Booking, string>({
      query: (id: string) => ({
        url: `/bookings/${id}/confirm-pickup-passenger`,
        method: 'PUT',
        body: {},
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
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
// Confirmer l'arrivée signalée par le passager (par le driver)
    confirmDropoff: builder.mutation<Booking, string>({
      query: (id: string) => ({
        url: `/bookings/${id}/confirm-dropoff`,
        method: 'PUT',
        body: {},
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
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
    })
  };
}
