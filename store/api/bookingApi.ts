import type { Booking, BookingStatus, WhatsAppNotificationData } from '../../types';
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
  rejectionReason?: string | null;
  acceptedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  passenger?: ServerUser | null;
  trip?: ServerTrip | null;
  passengerOrigin?: string | null;
  passengerOriginPoint?: { type: string; coordinates: [number, number] } | null;
  passengerDestination?: string | null;
  passengerDestinationPoint?: { type: string; coordinates: [number, number] } | null;
  pickedUp?: boolean;
  pickedUpAt?: string | null;
  pickedUpConfirmedByPassenger?: boolean;
  pickedUpConfirmedAt?: string | null;
  droppedOff?: boolean;
  droppedOffAt?: string | null;
  droppedOffConfirmedByPassenger?: boolean;
  droppedOffConfirmedAt?: string | null;
};

const formatPassengerName = (passenger?: ServerUser | null) => {
  if (!passenger) {
    return undefined;
  }
  const fullName = [passenger.firstName, passenger.lastName].filter(Boolean).join(' ').trim();
  return fullName || undefined;
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
  rejectionReason: booking.rejectionReason ?? undefined,
  acceptedAt: booking.acceptedAt ?? undefined,
  cancelledAt: booking.cancelledAt ?? undefined,
  createdAt: booking.createdAt,
  updatedAt: booking.updatedAt,
  trip: booking.trip ? mapServerTripToClient(booking.trip) : undefined,
  passengerOrigin: booking.passengerOrigin ?? undefined,
  passengerOriginCoordinates: booking.passengerOriginPoint 
    ? { latitude: booking.passengerOriginPoint.coordinates[1], longitude: booking.passengerOriginPoint.coordinates[0] }
    : undefined,
  passengerDestination: booking.passengerDestination ?? undefined,
  passengerDestinationCoordinates: booking.passengerDestinationPoint 
    ? { latitude: booking.passengerDestinationPoint.coordinates[1], longitude: booking.passengerDestinationPoint.coordinates[0] }
    : undefined,
  pickedUp: booking.pickedUp ?? false,
  pickedUpAt: booking.pickedUpAt ?? undefined,
  pickedUpConfirmedByPassenger: booking.pickedUpConfirmedByPassenger ?? false,
  pickedUpConfirmedAt: booking.pickedUpConfirmedAt ?? undefined,
  droppedOff: booking.droppedOff ?? false,
  droppedOffAt: booking.droppedOffAt ?? undefined,
  droppedOffConfirmedByPassenger: booking.droppedOffConfirmedByPassenger ?? false,
  droppedOffConfirmedAt: booking.droppedOffConfirmedAt ?? undefined,
});

export const bookingApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    createBooking: builder.mutation<
      Booking,
      {
        tripId: string;
        numberOfSeats: number;
        passengerOrigin?: string;
        passengerOriginCoordinates?: { latitude: number; longitude: number };
        passengerDestination?: string;
        passengerDestinationCoordinates?: { latitude: number; longitude: number };
      }
    >({
      query: (body) => ({
        url: '/bookings',
        method: 'POST',
        body,
      }),
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      invalidatesTags: ['Booking', 'Trip', 'MyTrips'],
    }),
    getMyBookings: builder.query<Booking[], void>({
      query: () => '/bookings/my-bookings',
      transformResponse: (response: ServerBooking[]) =>
        response.map((booking) => mapServerBookingToClient(booking)),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Booking' as const, id })), 'Booking']
          : ['Booking'],
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
              'Booking',
            ]
          : [{ type: 'Trip', id: arg }, 'Booking'],
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
              'Booking',
              'Trip',
            ]
          : ['Booking', 'Trip'],
    }),
    cancelBooking: builder.mutation<void, string>({
      query: (id: string) => ({
        url: `/bookings/${id}/cancel`,
        method: 'PUT',
      }),
      invalidatesTags: (_result, _error, id: string) => [{ type: 'Booking', id }, 'Booking', 'Trip'],
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
              'Booking',
              'Trip',
            ]
          : ['Booking', 'Trip'],
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
              'Booking',
              'Trip',
            ]
          : ['Booking', 'Trip'],
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
              'Booking',
              'Trip',
            ]
          : ['Booking', 'Trip'],
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
              'Booking',
              'Trip',
            ]
          : ['Booking', 'Trip'],
    }),

    // Confirmer la dépose du passager (par le driver)
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
              'Booking',
              'Trip',
            ]
          : ['Booking', 'Trip'],
    }),

    // Confirmer la dépose du passager (par le passager)
    confirmDropoffByPassenger: builder.mutation<Booking, string>({
      query: (id: string) => ({
        url: `/bookings/${id}/confirm-dropoff-passenger`,
        method: 'PUT',
        body: {},
      }),
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      invalidatesTags: (result) =>
        result
          ? [
              { type: 'Booking', id: result.id },
              { type: 'Trip', id: result.tripId },
              'Booking',
              'Trip',
            ]
          : ['Booking', 'Trip'],
    }),
  }),
});

export const {
  useCreateBookingMutation,
  useGetMyBookingsQuery,
  useGetTripBookingsQuery,
  useGetBookingByIdQuery,
  useUpdateBookingStatusMutation,
  useCancelBookingMutation,
  useAcceptBookingMutation,
  useRejectBookingMutation,
  useGetWhatsAppNotificationDataMutation,
  useConfirmPickupMutation,
  useConfirmPickupByPassengerMutation,
  useConfirmDropoffMutation,
  useConfirmDropoffByPassengerMutation,
} = bookingApi;

