import type { TripRequest, DriverOffer, DriverOfferWithTripRequest, DriverOfferStatus, TripRequestStatus, Trip } from '@/types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';
import type { ServerTrip } from './tripApi';
import { mapServerTripToClient } from './tripApi';

type ServerTripRequest = {
  id: string;
  passenger: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    profilePicture: string | null;
  };
  departureLocation: string;
  arrivalLocation: string;
  departureCoordinates: [number, number] | null;
  arrivalCoordinates: [number, number] | null;
  departureDateMin: string;
  departureDateMax: string;
  numberOfSeats: number;
  maxPricePerSeat: number | null;
  description: string | null;
  status: string;
  selectedDriver: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    profilePicture: string | null;
  } | null;
  selectedVehicle: {
    id: string;
    brand: string;
    model: string;
    color: string;
    licensePlate: string;
    photoUrl: string | null;
  } | null;
  selectedPricePerSeat: number | null;
  selectedAt: string | null;
  tripId: string | null;
  driverOffers?: ServerDriverOffer[];
  createdAt: string;
  updatedAt: string;
};

type ServerDriverOffer = {
  id: string;
  tripRequestId: string;
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    profilePicture: string | null;
  };
  vehicle: {
    id: string;
    brand: string;
    model: string;
    color: string;
    licensePlate: string;
    photoUrl: string | null;
  } | null;
  proposedDepartureDate: string;
  pricePerSeat: number | string;
  availableSeats: number;
  message: string | null;
  status: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type ServerDriverOfferWithTripRequest = {
  id: string;
  tripRequestId: string;
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    profilePicture: string | null;
  };
  vehicle: {
    id: string;
    brand: string;
    model: string;
    color: string;
    licensePlate: string;
    photoUrl: string | null;
  } | null;
  proposedDepartureDate: string;
  pricePerSeat: number | string;
  availableSeats: number;
  message: string | null;
  status: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  tripRequest: {
    id: string;
    departureLocation: string;
    arrivalLocation: string;
    departureDateMin: string;
    departureDateMax: string;
    numberOfSeats: number;
    maxPricePerSeat: number | string | null;
    status: string;
    passenger: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      profilePicture: string | null;
    };
  };
};

const mapServerTripRequestToClient = (request: ServerTripRequest): TripRequest => {
  const departureCoords = request.departureCoordinates;
  const arrivalCoords = request.arrivalCoordinates;

  const formatFullName = (user: { firstName: string; lastName: string }) => {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return fullName || 'Utilisateur';
  };

  const mapStatus = (status: string): TripRequestStatus => {
    switch ((status ?? '').toLowerCase()) {
      case 'pending':
        return 'pending';
      case 'offers_received':
        return 'offers_received';
      case 'driver_selected':
        return 'driver_selected';
      case 'cancelled':
      case 'canceled':
        return 'cancelled';
      case 'expired':
        return 'expired';
      default:
        return 'pending';
    }
  };

  return {
    id: request.id,
    passengerId: request.passenger.id,
    passengerName: formatFullName(request.passenger),
    passengerAvatar: request.passenger.profilePicture ?? undefined,
    departure: {
      name: request.departureLocation,
      address: request.departureLocation,
      lat: departureCoords?.[1] ?? 0,
      lng: departureCoords?.[0] ?? 0,
    },
    arrival: {
      name: request.arrivalLocation,
      address: request.arrivalLocation,
      lat: arrivalCoords?.[1] ?? 0,
      lng: arrivalCoords?.[0] ?? 0,
    },
    departureDateMin: request.departureDateMin,
    departureDateMax: request.departureDateMax,
    numberOfSeats: request.numberOfSeats,
    maxPricePerSeat: request.maxPricePerSeat ?? undefined,
    description: request.description ?? undefined,
    status: mapStatus(request.status),
    selectedDriverId: request.selectedDriver?.id ?? undefined,
    selectedVehicleId: request.selectedVehicle?.id ?? undefined,
    selectedPricePerSeat: request.selectedPricePerSeat ?? undefined,
    selectedAt: request.selectedAt ?? undefined,
    tripId: request.tripId ?? undefined,
    offers: request.driverOffers?.map(mapServerDriverOfferToClient),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
};

const mapServerDriverOfferToClient = (offer: ServerDriverOffer): DriverOffer => {
  const formatFullName = (user: { firstName: string; lastName: string }) => {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return fullName || 'Conducteur';
  };

  const mapStatus = (status: string): DriverOfferStatus => {
    switch ((status ?? '').toLowerCase()) {
      case 'pending':
        return 'pending';
      case 'accepted':
        return 'accepted';
      case 'rejected':
        return 'rejected';
      case 'cancelled':
      case 'canceled':
        return 'cancelled';
      default:
        return 'pending';
    }
  };

  const vehicleInfo = offer.vehicle
    ? `${offer.vehicle.brand} ${offer.vehicle.model} - ${offer.vehicle.color} (${offer.vehicle.licensePlate})`
    : undefined;

  return {
    id: offer.id,
    tripRequestId: offer.tripRequestId,
    driverId: offer.driver.id,
    driverName: formatFullName(offer.driver),
    driverAvatar: offer.driver.profilePicture ?? undefined,
    driverRating: 0, // Backend ne retourne pas le rating dans l'offre
    vehicleId: offer.vehicle?.id ?? undefined,
    vehicleInfo,
    proposedDepartureDate: offer.proposedDepartureDate,
    pricePerSeat: typeof offer.pricePerSeat === 'string' ? parseFloat(offer.pricePerSeat) : offer.pricePerSeat,
    availableSeats: offer.availableSeats,
    message: offer.message ?? undefined,
    status: mapStatus(offer.status),
    acceptedAt: offer.acceptedAt ?? undefined,
    rejectedAt: offer.rejectedAt ?? undefined,
    rejectionReason: offer.rejectionReason ?? undefined,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
};

const mapServerDriverOfferWithTripRequestToClient = (offer: ServerDriverOfferWithTripRequest): DriverOfferWithTripRequest => {
  const baseOffer = mapServerDriverOfferToClient({
    id: offer.id,
    tripRequestId: offer.tripRequestId,
    driver: offer.driver,
    vehicle: offer.vehicle,
    proposedDepartureDate: offer.proposedDepartureDate,
    pricePerSeat: offer.pricePerSeat,
    availableSeats: offer.availableSeats,
    message: offer.message,
    status: offer.status,
    acceptedAt: offer.acceptedAt,
    rejectedAt: offer.rejectedAt,
    rejectionReason: offer.rejectionReason,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  });

  const mapTripRequestStatus = (status: string): TripRequestStatus => {
    switch ((status ?? '').toLowerCase()) {
      case 'pending':
        return 'pending';
      case 'offers_received':
        return 'offers_received';
      case 'driver_selected':
        return 'driver_selected';
      case 'cancelled':
      case 'canceled':
        return 'cancelled';
      case 'expired':
        return 'expired';
      default:
        return 'pending';
    }
  };

  return {
    ...baseOffer,
    tripRequest: {
      id: offer.tripRequest.id,
      departureLocation: offer.tripRequest.departureLocation,
      arrivalLocation: offer.tripRequest.arrivalLocation,
      departureDateMin: offer.tripRequest.departureDateMin,
      departureDateMax: offer.tripRequest.departureDateMax,
      numberOfSeats: offer.tripRequest.numberOfSeats,
      maxPricePerSeat: typeof offer.tripRequest.maxPricePerSeat === 'string' 
        ? parseFloat(offer.tripRequest.maxPricePerSeat) 
        : offer.tripRequest.maxPricePerSeat,
      status: mapTripRequestStatus(offer.tripRequest.status),
      passenger: {
        id: offer.tripRequest.passenger.id,
        firstName: offer.tripRequest.passenger.firstName,
        lastName: offer.tripRequest.passenger.lastName,
        phone: offer.tripRequest.passenger.phone,
        profilePicture: offer.tripRequest.passenger.profilePicture,
      },
    },
  };
};

type CreateTripRequestPayload = {
  departureLocation: string;
  departureCoordinates: [number, number];
  arrivalLocation: string;
  arrivalCoordinates: [number, number];
  departureDateMin: string; // ISO string date
  departureDateMax: string; // ISO string date
  numberOfSeats: number;
  maxPricePerSeat?: number;
  description?: string;
};

type CreateDriverOfferPayload = {
  proposedDepartureDate: string; // ISO string date
  pricePerSeat: number;
  availableSeats: number;
  vehicleId?: string;
  message?: string;
};

type AcceptDriverOfferPayload = {
  offerId: string;
};

export const tripRequestApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    // Créer une demande de trajet
    createTripRequest: builder.mutation<TripRequest, CreateTripRequestPayload>({
      query: (payload: CreateTripRequestPayload) => ({
        url: '/trip-requests',
        method: 'POST',
        body: payload,
      }),
      transformResponse: (response: ServerTripRequest) => mapServerTripRequestToClient(response),
      invalidatesTags: ['TripRequest'],
    }),

    // Récupérer toutes les demandes de trajet disponibles (pour les drivers)
    getAvailableTripRequests: builder.query<TripRequest[], void>({
      query: () => '/trip-requests',
      transformResponse: (response: ServerTripRequest[]) =>
        response.map(mapServerTripRequestToClient),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'TripRequest' as const, id })),
              'TripRequest',
            ]
          : ['TripRequest'],
    }),

    // Récupérer mes demandes de trajet (pour le passager)
    getMyTripRequests: builder.query<TripRequest[], void>({
      query: () => '/trip-requests/my-requests',
      transformResponse: (response: ServerTripRequest[]) =>
        response.map(mapServerTripRequestToClient),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'TripRequest' as const, id })),
              'MyTripRequests',
            ]
          : ['MyTripRequests'],
    }),

    // Récupérer une demande de trajet par ID
    getTripRequestById: builder.query<TripRequest, string>({
      query: (id: string) => `/trip-requests/${id}`,
      transformResponse: (response: ServerTripRequest) => mapServerTripRequestToClient(response),
      providesTags: (_result, _error, id: string) => [{ type: 'TripRequest', id }],
    }),

    // Annuler une demande de trajet
    cancelTripRequest: builder.mutation<void, string>({
      query: (id: string) => ({
        url: `/trip-requests/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id: string) => [
        { type: 'TripRequest', id },
        'TripRequest',
        'MyTripRequests',
      ],
    }),

    // Créer une offre de driver pour une demande de trajet
    createDriverOffer: builder.mutation<DriverOffer, { tripRequestId: string; payload: CreateDriverOfferPayload }>({
      query: ({ tripRequestId, payload }: { tripRequestId: string; payload: CreateDriverOfferPayload }) => ({
        url: `/trip-requests/${tripRequestId}/offers`,
        method: 'POST',
        body: payload,
      }),
      transformResponse: (response: ServerDriverOffer) => mapServerDriverOfferToClient(response),
      invalidatesTags: (_result, _error, { tripRequestId }: { tripRequestId: string }) => [
        { type: 'TripRequest', id: tripRequestId },
        'TripRequest',
        'DriverOffer',
      ],
    }),


    // Récupérer les offres du driver connecté
    getMyDriverOffers: builder.query<DriverOfferWithTripRequest[], void>({
      query: () => '/trip-requests/my-offers',
      transformResponse: (response: ServerDriverOfferWithTripRequest[]) => response.map(mapServerDriverOfferWithTripRequestToClient),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'DriverOffer' as const, id })),
              'DriverOffer',
              'MyDriverOffers',
            ]
          : ['MyDriverOffers', 'DriverOffer'],
    }),

    // Accepter une offre de driver
    acceptDriverOffer: builder.mutation<TripRequest, { tripRequestId: string; payload: AcceptDriverOfferPayload }>({
      query: ({ tripRequestId, payload }: { tripRequestId: string; payload: AcceptDriverOfferPayload }) => ({
        url: `/trip-requests/${tripRequestId}/accept-offer`,
        method: 'POST',
        body: payload,
      }),
      transformResponse: (response: ServerTripRequest) => mapServerTripRequestToClient(response),
      invalidatesTags: (_result, _error, { tripRequestId }: { tripRequestId: string }) => [
        { type: 'TripRequest', id: tripRequestId },
        'TripRequest',
        'MyTripRequests',
        'DriverOffer',
        'MyDriverOffers',
        'Trip',
      ],
    }),

    // Rejeter une offre de driver (si le backend le supporte)
    rejectDriverOffer: builder.mutation<DriverOffer, { tripRequestId: string; offerId: string }>({
      query: ({ tripRequestId, offerId }: { tripRequestId: string; offerId: string }) => ({
        url: `/trip-requests/${tripRequestId}/offers/${offerId}/reject`,
        method: 'POST',
      }),
      transformResponse: (response: ServerDriverOffer) => mapServerDriverOfferToClient(response),
      invalidatesTags: (_result, _error, { tripRequestId }: { tripRequestId: string }) => [
        { type: 'TripRequest', id: tripRequestId },
        'TripRequest',
        'MyTripRequests',
        'DriverOffer',
        'MyDriverOffers',
      ],
    }),

    // Démarrer un trajet à partir d'une demande acceptée
    startTripFromRequest: builder.mutation<
      { trip: Trip; tripRequest: TripRequest },
      string
    >({
      query: (tripRequestId: string) => ({
        url: `/trip-requests/${tripRequestId}/start-trip`,
        method: 'PUT',
      }),
      transformResponse: (response: { trip: ServerTrip; tripRequest: ServerTripRequest }) => ({
        trip: mapServerTripToClient(response.trip),
        tripRequest: mapServerTripRequestToClient(response.tripRequest),
      }),
      invalidatesTags: (_result, _error, tripRequestId: string) => [
        { type: 'TripRequest', id: tripRequestId },
        'TripRequest',
        'MyTripRequests',
        'Trip',
        'MyTrips',
        'Booking',
      ],
    }),
  }),
});

export const {
  useCreateTripRequestMutation,
  useGetAvailableTripRequestsQuery,
  useGetMyTripRequestsQuery,
  useGetTripRequestByIdQuery,
  useCancelTripRequestMutation,
  useCreateDriverOfferMutation,
  useGetMyDriverOffersQuery,
  useAcceptDriverOfferMutation,
  useRejectDriverOfferMutation,
  useStartTripFromRequestMutation,
} = tripRequestApi;

