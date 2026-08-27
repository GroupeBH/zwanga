import type {
  Booking,
  BookingPaymentResponse,
  BookingStatus,
  DriverTripInterruptionRequest,
  PassengerTripInterruptionRequest,
  SubscriptionPaymentMethod,
  TripPaymentMode,
  TripPaymentStatus,
  TripInterruptionReason,
  TripInterruptionStatus,
  WhatsAppNotificationData,
} from '../../types';
import { baseApi } from './baseApi';
import type { ServerTrip } from './tripApi';
import { mapServerTripToClient } from './tripApi';
import type { BaseEndpointBuilder } from './types';
import type { BookingAutoProgressPayload } from '@/services/trackingSocket';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';

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
  noShowDetectedAt?: string | null;
  noShowReason?: string | null;
  noShowDriverDistanceMeters?: number | null;
  boardingUncertainDetectedAt?: string | null;
  boardingUncertainReason?: string | null;
  boardingUncertainDriverDistanceMeters?: number | null;
  pickupDetectionMethod?: string | null;
  dropoffDetectionMethod?: string | null;
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
  passengerDestinationCoordinates?: {
    latitude: number;
    longitude: number;
  } | null;
  passengerDestinationPoint?: {
    type: string;
    coordinates: [number, number];
  } | null;
  passengerLocationCoordinates?: { latitude: number; longitude: number } | null;
  passengerLocationPoint?: {
    type: string;
    coordinates: [number, number];
  } | null;
  passengerCurrentLocation?: {
    type: string;
    coordinates: [number, number];
  } | null;
  passengerLocationUpdatedAt?: string | null;
  passengerLastLocationUpdateAt?: string | null;
  pickedUp?: boolean;
  pickedUpAt?: string | null;
  pickedUpConfirmedByPassenger?: boolean;
  pickedUpConfirmedAt?: string | null;
  driverPickupArrivedAt?: string | null;
  droppedOff?: boolean;
  droppedOffAt?: string | null;
  droppedOffConfirmedByPassenger?: boolean;
  droppedOffConfirmedAt?: string | null;
  passengerDestinationApproachNotifiedAt?: string | null;
  safetyEmergencyContactIds?: string[] | null;
  interruptionRequest?: ServerPassengerTripInterruptionRequest | null;
  activeInterruptionRequest?: ServerPassengerTripInterruptionRequest | null;
  currentInterruptionRequest?: ServerPassengerTripInterruptionRequest | null;
  tripInterruptionRequest?: ServerDriverTripInterruptionRequest | null;
  activeTripInterruptionRequest?: ServerDriverTripInterruptionRequest | null;
};

type ServerTripInterruptionConfirmation = {
  id?: string;
  bookingId?: string;
  passengerId?: string;
  passengerName?: string | null;
  status?: string | null;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  passenger?: ServerUser | null;
};

type ServerPassengerTripInterruptionRequest = {
  id?: string;
  tripId?: string;
  bookingId?: string;
  passengerId?: string;
  reason?: string | null;
  note?: string | null;
  status?: string | null;
  requestedAt?: string | null;
  createdAt?: string | null;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  confirmedByDriverId?: string | null;
  rejectedByDriverId?: string | null;
};

type ServerDriverTripInterruptionRequest = {
  id?: string;
  tripId?: string;
  requestedByDriverId?: string;
  driverId?: string;
  reason?: string | null;
  note?: string | null;
  status?: string | null;
  requestedAt?: string | null;
  createdAt?: string | null;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  requiredPassengerCount?: number | null;
  confirmedPassengerCount?: number | null;
  rejectedPassengerCount?: number | null;
  confirmations?: ServerTripInterruptionConfirmation[] | null;
};

type UpdatePassengerLocationResponse = {
  bookingId: string;
  coordinates: [number, number];
  updatedAt: string;
  autoProgress?: BookingAutoProgressPayload;
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
    return normalizeTripMapCoordinate(point.coordinates[1], point.coordinates[0]) ?? undefined;
  }
  if (coordinates) {
    return normalizeTripMapCoordinate(coordinates.latitude, coordinates.longitude) ?? undefined;
  }
  return undefined;
};

const mapTripInterruptionReason = (reason?: string | null): TripInterruptionReason => {
  const normalizedReason = (reason ?? '').toLowerCase();
  switch (normalizedReason) {
    case 'emergency':
    case 'health':
    case 'safety':
    case 'route_issue':
    case 'personal':
    case 'other':
      return normalizedReason as TripInterruptionReason;
    default:
      return 'other';
  }
};

const mapTripInterruptionStatus = (status?: string | null): TripInterruptionStatus => {
  switch ((status ?? '').toLowerCase()) {
    case 'confirmed':
    case 'approved':
    case 'accepted':
      return 'confirmed';
    case 'rejected':
    case 'declined':
      return 'rejected';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'completed':
    case 'done':
      return 'completed';
    default:
      return 'pending';
  }
};

const resolveRequestedAt = (requestedAt?: string | null, createdAt?: string | null) =>
  requestedAt ?? createdAt ?? new Date(0).toISOString();

const mapPassengerInterruptionRequest = (
  request?: ServerPassengerTripInterruptionRequest | null,
): PassengerTripInterruptionRequest | null => {
  if (!request?.id || !request.tripId || !request.bookingId || !request.passengerId) {
    return null;
  }

  return {
    id: request.id,
    tripId: request.tripId,
    bookingId: request.bookingId,
    passengerId: request.passengerId,
    requestedByRole: 'passenger',
    reason: mapTripInterruptionReason(request.reason),
    note: request.note ?? null,
    status: mapTripInterruptionStatus(request.status),
    requestedAt: resolveRequestedAt(request.requestedAt, request.createdAt),
    confirmedAt: request.confirmedAt ?? null,
    rejectedAt: request.rejectedAt ?? null,
    cancelledAt: request.cancelledAt ?? null,
    completedAt: request.completedAt ?? null,
    confirmedByDriverId: request.confirmedByDriverId ?? null,
    rejectedByDriverId: request.rejectedByDriverId ?? null,
  };
};

const mapDriverInterruptionRequest = (
  request?: ServerDriverTripInterruptionRequest | null,
): DriverTripInterruptionRequest | null => {
  if (!request?.id || !request.tripId) {
    return null;
  }

  const confirmations = (request.confirmations ?? [])
    .filter((confirmation) => confirmation.bookingId && confirmation.passengerId)
    .map((confirmation) => ({
      id: confirmation.id,
      bookingId: confirmation.bookingId!,
      passengerId: confirmation.passengerId!,
      passengerName: confirmation.passengerName ?? formatPassengerName(confirmation.passenger),
      status:
        mapTripInterruptionStatus(confirmation.status) === 'confirmed'
          ? ('confirmed' as const)
          : mapTripInterruptionStatus(confirmation.status) === 'rejected'
            ? ('rejected' as const)
            : ('pending' as const),
      confirmedAt: confirmation.confirmedAt ?? null,
      rejectedAt: confirmation.rejectedAt ?? null,
    }));

  return {
    id: request.id,
    tripId: request.tripId,
    requestedByDriverId: request.requestedByDriverId ?? request.driverId ?? '',
    requestedByRole: 'driver',
    reason: mapTripInterruptionReason(request.reason),
    note: request.note ?? null,
    status: mapTripInterruptionStatus(request.status),
    requestedAt: resolveRequestedAt(request.requestedAt, request.createdAt),
    confirmedAt: request.confirmedAt ?? null,
    rejectedAt: request.rejectedAt ?? null,
    cancelledAt: request.cancelledAt ?? null,
    completedAt: request.completedAt ?? null,
    requiredPassengerCount: Number(request.requiredPassengerCount ?? confirmations.length) || confirmations.length,
    confirmedPassengerCount:
      Number(request.confirmedPassengerCount ?? confirmations.filter((item) => item.status === 'confirmed').length) ||
      0,
    rejectedPassengerCount:
      Number(request.rejectedPassengerCount ?? confirmations.filter((item) => item.status === 'rejected').length) || 0,
    confirmations,
  };
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
  noShowDetectedAt: booking.noShowDetectedAt ?? undefined,
  noShowReason: booking.noShowReason ?? undefined,
  noShowDriverDistanceMeters: booking.noShowDriverDistanceMeters ?? undefined,
  boardingUncertainDetectedAt: booking.boardingUncertainDetectedAt ?? undefined,
  boardingUncertainReason: booking.boardingUncertainReason ?? undefined,
  boardingUncertainDriverDistanceMeters: booking.boardingUncertainDriverDistanceMeters ?? undefined,
  pickupDetectionMethod: booking.pickupDetectionMethod ?? undefined,
  dropoffDetectionMethod: booking.dropoffDetectionMethod ?? undefined,
  createdAt: booking.createdAt,
  updatedAt: booking.updatedAt,
  trip: booking.trip ? mapServerTripToClient(booking.trip) : undefined,
  passengerOrigin: booking.passengerOrigin ?? undefined,
  passengerOriginReference: booking.passengerOriginReference ?? undefined,
  passengerOriginCoordinates: mapBookingCoordinates(booking.passengerOriginPoint, booking.passengerOriginCoordinates),
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
  passengerLocationUpdatedAt: booking.passengerLocationUpdatedAt ?? booking.passengerLastLocationUpdateAt ?? undefined,
  pickedUp: booking.pickedUp ?? false,
  pickedUpAt: booking.pickedUpAt ?? undefined,
  pickedUpConfirmedByPassenger: booking.pickedUpConfirmedByPassenger ?? false,
  pickedUpConfirmedAt: booking.pickedUpConfirmedAt ?? undefined,
  driverPickupArrivedAt: booking.driverPickupArrivedAt ?? undefined,
  droppedOff: booking.droppedOff ?? false,
  droppedOffAt: booking.droppedOffAt ?? undefined,
  droppedOffConfirmedByPassenger: booking.droppedOffConfirmedByPassenger ?? false,
  droppedOffConfirmedAt: booking.droppedOffConfirmedAt ?? undefined,
  passengerDestinationApproachNotifiedAt: booking.passengerDestinationApproachNotifiedAt ?? undefined,
  safetyEmergencyContactIds: booking.safetyEmergencyContactIds ?? [],
  interruptionRequest: mapPassengerInterruptionRequest(
    booking.interruptionRequest ?? booking.activeInterruptionRequest ?? booking.currentInterruptionRequest,
  ),
  tripInterruptionRequest: mapDriverInterruptionRequest(
    booking.tripInterruptionRequest ?? booking.activeTripInterruptionRequest,
  ),
});

const bookingListTag = { type: 'Booking' as const, id: 'LIST' };
const tripListTag = { type: 'Trip' as const, id: 'LIST' };
const myTripsListTag = { type: 'MyTrips' as const, id: 'LIST' };
const walletTag = { type: 'Wallet' as const, id: 'ME' };
const driverSettlementTag = { type: 'DriverSettlement' as const, id: 'ME' };

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
      }),
      invalidatesTags: (_result, _error, { bookingId }) => [{ type: 'Booking', id: bookingId }, bookingListTag],
    }),
    updateBookingPaymentMode: builder.mutation<Booking, { bookingId: string; paymentMode: TripPaymentMode }>({
      query: ({ bookingId, paymentMode }) => ({
        url: `/bookings/${bookingId}/payment-mode`,
        method: 'PUT',
        body: { paymentMode },
      }),
      transformResponse: (response: ServerBooking) => mapServerBookingToClient(response),
      invalidatesTags: (result, _error, { bookingId }) => [
        { type: 'Booking', id: result?.id ?? bookingId },
        bookingListTag,
        walletTag,
        driverSettlementTag,
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
      invalidatesTags: (_result, _error, { bookingId }) => [{ type: 'Booking', id: bookingId }, bookingListTag],
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
    confirmDropoffByPassenger: builder.mutation<Booking, string | { id: string; paymentMode?: TripPaymentMode }>({
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
  useRequestPassengerTripInterruptionMutation,
  useCancelPassengerTripInterruptionMutation,
  useConfirmPassengerTripInterruptionMutation,
  useRejectPassengerTripInterruptionMutation,
  useUpdatePassengerLocationMutation,
} = bookingApi;
