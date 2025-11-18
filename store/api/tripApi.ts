import type { Trip, TripStatus, VehicleType } from '../../types';
import { baseApi } from './baseApi';

type CoordinatesTuple = [number, number] | null | undefined;

type ServerUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  profilePicture?: string | null;
  rating?: number;
  role?: string;
  status?: string;
  isDriver?: boolean;
};

type ServerBooking = {
  id: string;
  seats?: number;
  status?: string;
  passenger: ServerUser | null;
};

type ServerTrip = {
  id: string;
  driverId: string;
  driver?: ServerUser | null;
  departureLocation: string;
  arrivalLocation: string;
  departureCoordinates?: CoordinatesTuple;
  arrivalCoordinates?: CoordinatesTuple;
  departureDate: string;
  availableSeats: number;
  pricePerSeat: number | string;
  description?: string;
  status?: string;
  vehicleType?: VehicleType;
  bookings?: ServerBooking[];
};

const fallbackCoordinate = (coords?: CoordinatesTuple): { lat: number; lng: number } | null => {
  if (!coords || coords.length < 2) {
    return null;
  }
  const [lng, lat] = coords;
  return {
    lat: Number(lat) || 0,
    lng: Number(lng) || 0,
  };
};

const formatFullName = (user?: ServerUser | null) => {
  if (!user) return 'Conducteur';
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || 'Conducteur';
};

const mapTripStatus = (status?: string): TripStatus => {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
    case 'planned':
      return 'upcoming';
    case 'ongoing':
    case 'in_progress':
    case 'running':
      return 'ongoing';
    case 'completed':
    case 'done':
      return 'completed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return 'upcoming';
  }
};

const mapPassengers = (bookings?: ServerBooking[]): Trip['passengers'] => {
  if (!bookings?.length) {
    return [];
  }

  return bookings
    .map((booking) => booking.passenger)
    .filter((passenger): passenger is ServerUser => Boolean(passenger))
    .map((passenger) => ({
      id: passenger.id,
      name: formatFullName(passenger),
      avatar: passenger.profilePicture ?? undefined,
      rating: passenger.rating ?? 4.5,
      phone: passenger.phone ?? '',
    }));
};

const mapServerTripToClient = (trip: ServerTrip): Trip => {
  const departureCoords = fallbackCoordinate(trip.departureCoordinates);
  const arrivalCoords = fallbackCoordinate(trip.arrivalCoordinates);
  const bookedSeats =
    trip.bookings?.reduce((total, booking) => total + (booking.seats ?? 0), 0) ?? 0;

  return {
    id: trip.id,
    driverId: trip.driverId,
    driverName: formatFullName(trip.driver),
    driverAvatar: trip.driver?.profilePicture ?? undefined,
    driverRating: trip.driver?.rating ?? 4.9,
    vehicleType: trip.vehicleType ?? 'car',
    vehicleInfo: trip.description?.trim() || 'Informations véhicule fournies par le conducteur',
    departure: {
      name: trip.departureLocation,
      address: trip.departureLocation,
      lat: departureCoords?.lat ?? 0,
      lng: departureCoords?.lng ?? 0,
    },
    arrival: {
      name: trip.arrivalLocation,
      address: trip.arrivalLocation,
      lat: arrivalCoords?.lat ?? 0,
      lng: arrivalCoords?.lng ?? 0,
    },
    departureTime: trip.departureDate,
    arrivalTime: trip.departureDate,
    price: Number(trip.pricePerSeat),
    availableSeats: trip.availableSeats,
    totalSeats: Math.max(trip.availableSeats + bookedSeats, trip.availableSeats),
    status: mapTripStatus(trip.status),
    passengers: mapPassengers(trip.bookings),
  };
};

/**
 * API trajets
 * Gère la création, recherche, réservation et gestion des trajets
 */
export type TripSearchParams = {
  departureLocation?: string;
  arrivalLocation?: string;
  departureCoordinates?: [number, number];
  arrivalCoordinates?: [number, number];
  departureRadiusKm?: number;
  arrivalRadiusKm?: number;
  departureDate?: string;
  minSeats?: number;
  maxPrice?: number;
};

export type TripSearchByPointsPayload = {
  departureCoordinates: [number, number];
  arrivalCoordinates: [number, number];
  departureRadiusKm?: number;
  arrivalRadiusKm?: number;
  departureDate?: string;
  minSeats?: number;
  maxPrice?: number;
};

type CreateTripPayload = {
  departureLocation: string;
  departureCoordinates: [number, number];
  arrivalLocation: string;
  arrivalCoordinates: [number, number];
  departureDate: string;
  availableSeats: number;
  pricePerSeat: number;
  description?: string;
};

type UpdateTripRequest = Partial<CreateTripPayload> & {
  status?: TripStatus;
};

export const tripApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    // Rechercher des trajets avec filtres
    getTrips: builder.query<Trip[], TripSearchParams>({
      query: (params) => ({
        url: '/trips',
        params,
      }),
      transformResponse: (response: ServerTrip[]) => response.map(mapServerTripToClient),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Trip' as const, id })), 'Trip']
          : ['Trip'],
    }),
    getMyTrips: builder.query<Trip[], void>({
      query: () => ({
        url: '/trips/my-trips',
      }),
      transformResponse: (response: ServerTrip[]) => response.map(mapServerTripToClient),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'MyTrips' as const, id })), 'MyTrips']
          : ['MyTrips'],
    }),
    searchTripsByCoordinates: builder.mutation<Trip[], TripSearchByPointsPayload>({
      query: (body) => ({
        url: '/trips/search/coordinates',
        method: 'POST',
        body,
      }),
      transformResponse: (response: ServerTrip[]) => response.map(mapServerTripToClient),
    }),


    // Récupérer un trajet par son ID
    getTripById: builder.query<Trip, string>({
      query: (id) => `/trips/${id}`,
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      providesTags: (result, error, id) => [{ type: 'Trip', id }],
    }),

    // Créer un nouveau trajet
    createTrip: builder.mutation<Trip, CreateTripPayload>({
      query: (trip) => ({
        url: '/trips',
        method: 'POST',
        body: trip,
      }),
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      invalidatesTags: ['Trip', 'MyTrips'],
    }),

    // Mettre à jour un trajet existant
    updateTrip: builder.mutation<Trip, { id: string; updates: UpdateTripRequest }>({
      query: ({ id, updates }) => ({
        url: `/trips/${id}`,
        method: 'PUT',
        body: updates,
      }),
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Trip', id },
        { type: 'MyTrips', id },
        'Trip',
        'MyTrips',
      ],
    }),

    // Annuler un trajet
    deleteTrip: builder.mutation<void, string>({
      query: (id) => ({
        url: `/trips/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Trip', id },
        { type: 'MyTrips', id },
        'Trip',
        'MyTrips',
      ],
    }),

    // Réserver des places sur un trajet
    bookTrip: builder.mutation<void, { tripId: string; seats: number }>({
      query: ({ tripId, seats }) => ({
        url: `/trips/${tripId}/book`,
        method: 'POST',
        body: { seats },
      }),
      invalidatesTags: (result, error, { tripId }) => [{ type: 'Trip', id: tripId }, 'Trip'],
    }),
  }),
});

export const {
  useGetTripsQuery,
  useGetMyTripsQuery,
  useGetTripByIdQuery,
  useCreateTripMutation,
  useUpdateTripMutation,
  useDeleteTripMutation,
  useBookTripMutation,
  useSearchTripsByCoordinatesMutation,
} = tripApi;


