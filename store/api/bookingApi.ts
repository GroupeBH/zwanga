import type {
  Booking,
  BookingPaymentResponse,
  BookingStatus,
  SubscriptionPaymentMethod,
  TripPaymentMode,
  TripPaymentStatus,
  WhatsAppNotificationData,
} from '../../types';
import { baseApi } from './baseApi';
import type { ServerTrip } from './tripApi';
import { mapServerTripToClient } from './tripApi';
import type { BaseEndpointBuilder } from './types';

type ServerUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  profilePicture?: string | null;
};

type ServerBooking = {
  id: string;
  tripId: string;
  passengerId: string;
  numberOfSeats: number;
  status: BookingStatus;
  paymentMode?: TripPaymentMode | null;
  paymentStatus?: TripPaymentStatus | null;
  paymentAmount?: number | string | null;
  paymentCurrency?: string | null;
  paymentReference?: string | null;
  paymentTransactionId?: string | null;
  paidAt?: string | null;
  rejectionReason?: string | null;
  acceptedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  passenger?: ServerUser | null;
  trip?: ServerTrip | null;
  passengerOrigin?: string | null;
  passengerOriginReference?: string | null;
  passengerOriginCoordinates?: { latitude: number; longitude: number } | null;
  passengerOriginPoint?: { type: string; coordinates: [number, number] } | null;
  passengerDestination?: string | null;
  passengerDestinationReference?: string | null;
  passengerDestinationCoordinates?: { latitude: number; longitude: number } | null;
  passengerDestinationPoint?: { type: string; coordinates: [number, number] } | null;
  passengerLocationCoordinates?: { latitude: number; longitude: number } | null;
  passengerLocationPoint?: { type: string; coordinates: [number, number] } | null;
  passengerCurrentLocation?: { type: string; coordinates: [number, number] } | null;
  passengerLocationUpdatedAt?: string | null;
  passengerLastLocationUpdateAt?: string | null;
  pickedUp?: boolean;
  pickedUpAt?: string | null;
  pickedUpConfirmedByPassenger?: boolean;
  pickedUpConfirmedAt?: string | null;
  droppedOff?: boolean;
  droppedOffAt?: string | null;
  droppedOffConfirmedByPassenger?: boolean;
  droppedOffConfirmedAt?: string | null;
  safetyEmergencyContactIds?: string[] | null;
};

type UpdatePassengerLocationResponse = {
  bookingId: string;
  coordinates: [number, number];
  updatedAt: string;
  autoProgress?: {
    tripId: string;
    events: Array<{
      type: 'pickup_confirmed' | 'dropoff_confirmed';
      bookingId: string;
      tripId: string;
      passengerId: string;
    }>;
  };
};

const formatPassengerName = (passenger?: ServerUser | null) => {
  if (!passenger) {
    return undefined;
  }
  const fullName = [passenger.firstName, passenger.lastName].filter(Boolean).join(' ').trim();
  return fullName || undefined;
};

const mapBookingCoordinates = (
  point?: { type: string; coordinates: [number, number] } | null,
  coordinates?: { latitude: number; longitude: number } | null,
) => {
  if (point) {
    return { latitude: point.coordinates[1], longitude: point.coordinates[0] };
  }
  if (coordinates) {
    return coordinates;
  }
  return undefined;
};

const mapServerBookingToClient = (booking: ServerBooking): Booking => ({
  id: booking.id,
  tripId: booking.tripId,
  passengerId: booking.passengerId,
  passengerName: formatPassengerName(booking.passenger),
  passengerAvatar: booking.passenger?.profilePicture ?? undefined,
  passengerPhone: booking.passenger?.phone ?? undefined,
  numberOfSeats: booking.numberOfSeats,
  status: booking.status ?? 'pending',
  paymentMode: booking.paymentMode ?? undefined,
  paymentStatus: booking.paymentStatus ?? undefined,
  paymentAmount: booking.paymentAmount ?? undefined,
  paymentCurrency: booking.paymentCurrency ?? undefined,
  paymentReference: booking.paymentReference ?? undefined,
  paymentTransactionId: booking.paymentTransactionId ?? undefined,
  paidAt: booking.paidAt ?? undefined,
  rejectionReason: booking.rejectionReason ?? undefined,
  acceptedAt: booking.acceptedAt ?? undefined,
  cancelledAt: booking.cancelledAt ?? undefined,
  createdAt: booking.createdAt,
  updatedAt: booking.updatedAt,
  trip: booking.trip ? mapServerTripToClient(booking.trip) : undefined,
  passengerOrigin: booking.passengerOrigin ?? undefined,
  passengerOriginReference: booking.passengerOriginReference ?? undefined,
  passengerOriginCoordinates: mapBookingCoordinates(
    booking.passengerOriginPoint,
    booking.passengerOriginCoordinates,
  ),
  passengerDestination: booking.passengerDestination ?? undefined,
  passengerDestinationReference: booking.passengerDestinationReference ?? undefined,
  passengerDestinationCoordinates: mapBookingCoordinates(
    booking.passengerDestinationPoint,
    booking.passengerDestinationCoordinates,
  ),
  passengerLocationCoordinates: mapBookingCoordinates(
    booking.passengerCurrentLocation ?? booking.passengerLocationPoint,
    booking.passengerLocationCoordinates,
  ),
  passengerLocationUpdatedAt:
    booking.passengerLocationUpdatedAt ?? booking.passengerLastLocationUpdateAt ?? undefined,
  pickedUp: booking.pickedUp ?? false,
  pickedUpAt: booking.pickedUpAt ?? undefined,
  pickedUpConfirmedByPassenger: booking.pickedUpConfirmedByPassenger ?? false,
  pickedUpConfirmedAt: booking.pickedUpConfirmedAt ?? undefined,
  droppedOff: booking.droppedOff ?? false,
  droppedOffAt: booking.droppedOffAt ?? undefined,
  droppedOffConfirmedByPassenger: booking.droppedOffConfirmedByPassenger ?? false,
  droppedOffConfirmedAt: booking.droppedOffConfirmedAt ?? undefined,
  safetyEmergencyContactIds: booking.safetyEmergencyContactIds ?? [],
});

const bookingListTag = { type: 'Booking' as const, id: 'LIST' };
const tripListTag = { type: 'Trip' as const, id: 'LIST' };
const myTripsListTag = { type: 'MyTrips' as const, id: 'LIST' };

export const bookingApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
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
        passengerDestinationCoordinates?: { latitude: number; longitude: number };
        paymentMode?: TripPaymentMode;
      }
    >({
      query: (body) => ({
        url: '/bookings',
        method: 'POST',
        body,
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
      transformResponse: (response: ServerBooking[]) =>
        response.map((booking) => mapServerBookingToClient(booking)),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Booking' as const, id })), bookingListTag]
          : [bookingListTag],
    }),
    getTripBookings: builder.query<Booking[], string>({
      query: (tripId: string) => `/bookings/trip/${tripId}`,
      transformResponse: (response: ServerBooking[]) =>
        response.map((booking) => mapServerBookingToClient(booking)),
      providesTags: (result: Booking[] | undefined, _error: unknown, arg: string) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Booking' as const, id })),
              { type: 'Trip', id: arg },
              bookingListTag,
            ]
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
      }),
      invalidatesTags: (_result, _error, { bookingId }) => [
        { type: 'Booking', id: bookingId },
        bookingListTag,
      ],
    }),
    updateBookingPaymentMode: builder.mutation<
      Booking,
      { bookingId: string; paymentMode: TripPaymentMode }
    >({
      query: ({ bookingId, paymentMode }) => ({
        url: `/bookings/${bookingId}/payment-mode`,
        method: 'PUT',
        body: { paymentMode },
      }),
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      invalidatesTags: (result, _error, { bookingId }) => [
        { type: 'Booking', id: result?.id ?? bookingId },
        bookingListTag,
      ],
    }),
    checkBookingPaymentStatus: builder.query<BookingPaymentResponse, string>({
      query: (orderNumber) => `/bookings/payments/${orderNumber}/status`,
      providesTags: (result) =>
        result?.booking?.id
          ? [{ type: 'Booking', id: result.booking.id }, bookingListTag]
          : [bookingListTag],
    }),
    getBookingById: builder.query<Booking, string>({
      query: (id: string) => `/bookings/${id}`,
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      providesTags: (_result: Booking | undefined, _error: unknown, id: string) => [
        { type: 'Booking', id },
      ],
    }),
    updateBookingStatus: builder.mutation<
      Booking,
      { id: string; status: BookingStatus; rejectionReason?: string }
    >({
      query: ({ id, ...body }: { id: string; status: BookingStatus; rejectionReason?: string }) => ({
        url: `/bookings/${id}/status`,
        method: 'PUT',
        body,
      }),
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      invalidatesTags: (result) =>
        result
          ? [
              { type: 'Booking', id: result.id },
              { type: 'Trip', id: result.tripId },
              bookingListTag,
              tripListTag,
            ]
          : [bookingListTag, tripListTag],
    }),
    cancelBooking: builder.mutation<void, string>({
      query: (id: string) => ({
        url: `/bookings/${id}/cancel`,
        method: 'PUT',
      }),
      invalidatesTags: (_result, _error, id: string) => [
        { type: 'Booking', id },
        bookingListTag,
        tripListTag,
        myTripsListTag,
      ],
    }),
    acceptBooking: builder.mutation<Booking, string>({
      query: (id: string) => ({
        url: `/bookings/${id}/accept`,
        method: 'PUT',
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
    rejectBooking: builder.mutation<Booking, { id: string; reason: string }>({
      query: ({ id, reason }: { id: string; reason: string }) => ({
        url: `/bookings/${id}/reject`,
        method: 'PUT',
        body: { reason },
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
      invalidatesTags: (_result, _error, { bookingId }) => [
        { type: 'Booking', id: bookingId },
        bookingListTag,
      ],
    }),

    // Confirmer la récupération du passager (par le driver)
    confirmPickup: builder.mutation<Booking, string>({
      query: (id: string) => ({
        url: `/bookings/${id}/confirm-pickup`,
        method: 'PUT',
        body: {},
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

    // Signaler l'arrivée du passager (par le passager)
    confirmDropoffByPassenger: builder.mutation<
      Booking,
      string | { id: string; paymentMode?: TripPaymentMode }
    >({
      query: (arg: string | { id: string; paymentMode?: TripPaymentMode }) => {
        const id = typeof arg === 'string' ? arg : arg.id;
        const paymentMode = typeof arg === 'string' ? undefined : arg.paymentMode;
        return {
          url: `/bookings/${id}/confirm-dropoff-passenger`,
          method: 'PUT',
          body: paymentMode ? { paymentMode } : {},
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
    updatePassengerLocation: builder.mutation<
      UpdatePassengerLocationResponse,
      { bookingId: string; latitude: number; longitude: number }
    >({
      query: ({ bookingId, latitude, longitude }) => ({
        url: `/bookings/${bookingId}/passenger-location`,
        method: 'PUT',
        body: { latitude, longitude },
      }),
      invalidatesTags: (result, _error, { bookingId }) => [
        { type: 'Booking', id: bookingId },
        ...(result?.autoProgress?.events.length
          ? [
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
          : []),
      ],
    }),
  }),
});

export const {
  useCreateBookingMutation,
  useGetMyBookingsQuery,
  useGetTripBookingsQuery,
  useInitiateBookingPaymentMutation,
  useLazyCheckBookingPaymentStatusQuery,
  useUpdateBookingPaymentModeMutation,
  useGetBookingByIdQuery,
  useUpdateBookingStatusMutation,
  useCancelBookingMutation,
  useAcceptBookingMutation,
  useRejectBookingMutation,
  useGetWhatsAppNotificationDataMutation,
  useSetBookingEmergencyContactsMutation,
  useConfirmPickupMutation,
  useConfirmPickupByPassengerMutation,
  useConfirmDropoffMutation,
  useConfirmDropoffByPassengerMutation,
  useUpdatePassengerLocationMutation,
} = bookingApi;
