import type {
  GeoPoint,
  RecurringTripStatus,
  RecurringTripTemplate,
  Trip,
  TripStatus,
  Vehicle,
  VehicleType,
} from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

type CoordinatesTuple = [number, number] | null | undefined;

type ServerUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  profilePicture?: string | null;
  rating?: number | null;
  averageRating?: number | null;
  totalRatings?: number;
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

type ServerVehicle = {
  id: string;
  ownerId: string;
  brand: string;
  model: string;
  color: string;
  licensePlate: string;
  photoUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ServerTrip = {
  id: string;
  driverId: string;
  driver?: ServerUser | null;
  departureLocation: string;
  arrivalLocation: string;
  departureCoordinates?: CoordinatesTuple;
  arrivalCoordinates?: CoordinatesTuple;
  departureDate: string;
  availableSeats: number;
  totalSeats?: number; // Nombre total de places (ajouté par le backend)
  pricePerSeat: number | string;
  isFree?: boolean;
  description?: string;
  status?: string;
  vehicleType?: VehicleType;
  vehicleId?: string | null;
  vehicle?: ServerVehicle | null;
  bookings?: ServerBooking[];
  currentLocation?: GeoPoint | null;
  lastLocationUpdateAt?: string | null;
  completedAt?: string | null;
  driverSafetyEmergencyContactIds?: string[];
  recurringTemplateId?: string | null;
  recurringOccurrenceDate?: string | null;
};

export type ServerRecurringTripTemplate = {
  id: string;
  driverId: string;
  departureLocation: string;
  arrivalLocation: string;
  departureCoordinates?: CoordinatesTuple;
  arrivalCoordinates?: CoordinatesTuple;
  departureTime: string;
  weekdays: number[];
  startDate: string;
  endDate?: string | null;
  totalSeats: number;
  pricePerSeat: number | string;
  isFree: boolean;
  description?: string | null;
  status: string;
  vehicleId: string;
  vehicle?: ServerVehicle | null;
  nextOccurrenceDate?: string | null;
  upcomingGeneratedTripsCount?: number;
  createdAt: string;
  updatedAt: string;
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

const resolveUserAverageRating = (user?: ServerUser | null): number => {
  const parsed = Number(user?.averageRating ?? user?.rating);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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

const mapRecurringTripStatus = (status?: string): RecurringTripStatus => {
  return (status ?? '').toLowerCase() === 'paused' ? 'paused' : 'active';
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
      rating: resolveUserAverageRating(passenger),
      phone: passenger.phone ?? '',
    }));
};

const mapServerVehicleToClient = (vehicle: ServerVehicle | null | undefined): Vehicle | undefined => {
  if (!vehicle) {
    return undefined;
  }
  return {
    id: vehicle.id,
    ownerId: vehicle.ownerId,
    brand: vehicle.brand ?? '',
    model: vehicle.model ?? '',
    color: vehicle.color ?? '',
    licensePlate: vehicle.licensePlate ?? '',
    photoUrl: vehicle.photoUrl ?? null,
    isActive: vehicle.isActive ?? true,
    createdAt: vehicle.createdAt ?? new Date().toISOString(),
    updatedAt: vehicle.updatedAt ?? new Date().toISOString(),
  };
};

export const mapServerTripToClient = (trip: ServerTrip): Trip => {
  const departureCoords = fallbackCoordinate(trip.departureCoordinates);
  const arrivalCoords = fallbackCoordinate(trip.arrivalCoordinates);
  const parsedDriverRating = resolveUserAverageRating(trip.driver);
  
  // Compter uniquement les réservations acceptées pour calculer le nombre initial de places
  const acceptedBookedSeats =
    trip.bookings
      ?.filter((booking) => {
        const status = (booking.status ?? '').toLowerCase();
        return status === 'accepted' || status === 'completed';
      })
      .reduce((total, booking) => total + (booking.seats ?? 0), 0) ?? 0;

  // Le nombre initial de places disponibles lors de la publication
  // Si totalSeats est fourni par le backend, l'utiliser, sinon calculer
  const totalSeats = trip.totalSeats ?? (trip.availableSeats + acceptedBookedSeats);

  return {
    id: trip.id,
    driverId: trip.driverId,
    driverName: formatFullName(trip.driver),
    driverAvatar: trip.driver?.profilePicture ?? undefined,
    driverRating: Number.isFinite(parsedDriverRating) && parsedDriverRating > 0 ? parsedDriverRating : 0,
    driver: trip.driver
      ? {
          id: trip.driver.id,
          firstName: trip.driver.firstName,
          lastName: trip.driver.lastName,
          phone: trip.driver.phone,
          profilePicture: trip.driver.profilePicture ?? null,
          role: trip.driver.role as any,
          status: trip.driver.status,
          isDriver: trip.driver.isDriver ?? false,
          averageRating:
            Number.isFinite(Number(trip.driver.averageRating))
              ? Number(trip.driver.averageRating)
              : undefined,
          totalRatings:
            Number.isFinite(Number(trip.driver.totalRatings))
              ? Number(trip.driver.totalRatings)
              : undefined,
        }
      : null,
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
    isFree: trip.isFree ?? Number(trip.pricePerSeat) === 0,
    availableSeats: trip.availableSeats,
    // totalSeats représente le nombre initial de places disponibles lors de la publication
    totalSeats: Math.max(totalSeats, trip.availableSeats),
    status: mapTripStatus(trip.status),
    passengers: mapPassengers(trip.bookings),
    currentLocation: trip.currentLocation ?? null,
    lastLocationUpdateAt: trip.lastLocationUpdateAt ?? null,
    completedAt: trip.completedAt ?? null,
    vehicleId: trip.vehicleId ?? null,
    description: trip.description ?? null,
    vehicle: mapServerVehicleToClient(trip.vehicle),
    driverSafetyEmergencyContactIds: Array.isArray(trip.driverSafetyEmergencyContactIds)
      ? trip.driverSafetyEmergencyContactIds
      : [],
    recurringTemplateId: trip.recurringTemplateId ?? null,
    recurringOccurrenceDate: trip.recurringOccurrenceDate ?? null,
  };
};

const mapServerRecurringTripToClient = (
  template: ServerRecurringTripTemplate,
): RecurringTripTemplate => {
  const departureCoords = fallbackCoordinate(template.departureCoordinates);
  const arrivalCoords = fallbackCoordinate(template.arrivalCoordinates);

  return {
    id: template.id,
    driverId: template.driverId,
    departure: {
      name: template.departureLocation,
      address: template.departureLocation,
      lat: departureCoords?.lat ?? 0,
      lng: departureCoords?.lng ?? 0,
    },
    arrival: {
      name: template.arrivalLocation,
      address: template.arrivalLocation,
      lat: arrivalCoords?.lat ?? 0,
      lng: arrivalCoords?.lng ?? 0,
    },
    departureTime: template.departureTime,
    weekdays: Array.isArray(template.weekdays) ? template.weekdays : [],
    startDate: template.startDate,
    endDate: template.endDate ?? null,
    totalSeats: Number(template.totalSeats ?? 0),
    pricePerSeat: Number(template.pricePerSeat ?? 0),
    isFree: template.isFree ?? Number(template.pricePerSeat) === 0,
    description: template.description ?? null,
    status: mapRecurringTripStatus(template.status),
    vehicleId: template.vehicleId,
    vehicle: mapServerVehicleToClient(template.vehicle) ?? null,
    nextOccurrenceDate: template.nextOccurrenceDate ?? null,
    upcomingGeneratedTripsCount: Number(template.upcomingGeneratedTripsCount ?? 0),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
};

const cleanObject = <T extends Record<string, unknown>>(value: T): Partial<T> => {
  return Object.fromEntries(
    Object.entries(value).filter(([, current]) => current !== undefined && current !== null),
  ) as Partial<T>;
};

/**
 * API trajets
 * Gère la création, recherche, réservation et gestion des trajets
 */
export type TripSearchParams = {
  keywords?: string;
  departureLocation?: string;
  arrivalLocation?: string;
  departureCoordinates?: [number, number];
  arrivalCoordinates?: [number, number];
  departureRadiusKm?: number;
  arrivalRadiusKm?: number;
  departureDate?: string;
  minSeats?: number;
  maxPrice?: number;
  isFree?: boolean;
};

export type TripSearchByPointsPayload = {
  keywords?: string | null;
  departureCoordinates?: [number, number] | null;
  arrivalCoordinates?: [number, number] | null;
  departureRadiusKm?: number | null;
  arrivalRadiusKm?: number | null;
  departureDate?: string | null;
  minSeats?: number | null;
  maxPrice?: number | null;
};

type CreateTripPayload = {
  departureLocation: string;
  departureCoordinates: [number, number];
  arrivalLocation: string;
  arrivalCoordinates: [number, number];
  departureDate: string;
  totalSeats: number;
  // availableSeats: number | null | undefined;
  pricePerSeat: number;
  isFree?: boolean;
  description?: string;
  vehicleId?: string;
};

export type CreateRecurringTripPayload = {
  departureLocation: string;
  departureCoordinates: [number, number];
  arrivalLocation: string;
  arrivalCoordinates: [number, number];
  startDate: string;
  endDate?: string;
  departureTime: string;
  weekdays: number[];
  totalSeats: number;
  pricePerSeat: number;
  isFree?: boolean;
  description?: string;
  vehicleId: string;
};

type UpdateTripRequest = Partial<CreateTripPayload> & {
  status?: TripStatus;
};

type DriverEmergencyContactsResponse = {
  tripId: string;
  emergencyContactIds: string[];
  contacts: { id: string; name: string; phone: string }[];
};

export const tripApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    // Rechercher des trajets avec filtres
    getTrips: builder.query<Trip[], TripSearchParams>({
      query: (params: TripSearchParams) => ({
        url: '/trips',
        params: cleanObject(params),
      }),
      transformResponse: (response: ServerTrip[]) => response.map(mapServerTripToClient),
      providesTags: (result: Trip[] | undefined) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Trip' as const, id })), 'Trip']
          : ['Trip'],
    }),
    getAllTrips: builder.query<Trip[], any>({
      query: () => ({
        url: '/trips/all-trips',
      }),
      transformResponse: (response: ServerTrip[]) => response.map(mapServerTripToClient),
      providesTags: (result: Trip[] | undefined) =>
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
    getMyRecurringTrips: builder.query<RecurringTripTemplate[], void>({
      query: () => ({
        url: '/trips/recurring/my',
      }),
      transformResponse: (response: ServerRecurringTripTemplate[]) =>
        response.map(mapServerRecurringTripToClient),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'RecurringTrip' as const, id })), 'RecurringTrip']
          : ['RecurringTrip'],
    }),
    searchTripsByCoordinates: builder.mutation<Trip[], TripSearchByPointsPayload>({
      query: (body: TripSearchByPointsPayload) => ({
        url: '/trips/search/coordinates',
        method: 'POST',
        body: cleanObject(body),
      }),
      transformResponse: (response: ServerTrip[]) => response.map(mapServerTripToClient),
    }),


    // Récupérer un trajet par son ID
    getTripById: builder.query<Trip, string>({
      query: (id: string) => `/trips/${id}`,
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      providesTags: (_result, _error, id: string) => [{ type: 'Trip', id }],
    }),

    // Créer un nouveau trajet
    createTrip: builder.mutation<Trip, CreateTripPayload>({
      query: (trip: CreateTripPayload) => ({
        url: '/trips',
        method: 'POST',
        body: trip,
      }),
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      invalidatesTags: ['Trip', 'MyTrips'],
    }),
    createRecurringTrip: builder.mutation<RecurringTripTemplate, CreateRecurringTripPayload>({
      query: (trip: CreateRecurringTripPayload) => ({
        url: '/trips/recurring',
        method: 'POST',
        body: trip,
      }),
      transformResponse: (response: ServerRecurringTripTemplate) =>
        mapServerRecurringTripToClient(response),
      invalidatesTags: ['RecurringTrip', 'Trip', 'MyTrips'],
    }),
    pauseRecurringTrip: builder.mutation<RecurringTripTemplate, string>({
      query: (id: string) => ({
        url: `/trips/recurring/${id}/pause`,
        method: 'PUT',
      }),
      transformResponse: (response: ServerRecurringTripTemplate) =>
        mapServerRecurringTripToClient(response),
      invalidatesTags: (_result, _error, id) => [
        { type: 'RecurringTrip', id },
        'RecurringTrip',
        'Trip',
        'MyTrips',
      ],
    }),
    resumeRecurringTrip: builder.mutation<RecurringTripTemplate, string>({
      query: (id: string) => ({
        url: `/trips/recurring/${id}/resume`,
        method: 'PUT',
      }),
      transformResponse: (response: ServerRecurringTripTemplate) =>
        mapServerRecurringTripToClient(response),
      invalidatesTags: (_result, _error, id) => [
        { type: 'RecurringTrip', id },
        'RecurringTrip',
        'Trip',
        'MyTrips',
      ],
    }),

    // Mettre à jour un trajet existant
    updateTrip: builder.mutation<Trip, { id: string; updates: UpdateTripRequest }>({
      query: ({ id, updates }: { id: string; updates: UpdateTripRequest }) => ({
        url: `/trips/${id}`,
        method: 'PUT',
        body: updates,
      }),
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      invalidatesTags: (_result, _error, { id }: { id: string }) => [
        { type: 'Trip', id },
        { type: 'MyTrips', id },
        'Trip',
        'MyTrips',
      ],
    }),

    // Annuler un trajet
    deleteTrip: builder.mutation<void, string>({
      query: (id: string) => ({
        url: `/trips/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id: string) => [
        { type: 'Trip', id },
        { type: 'MyTrips', id },
        'Trip',
        'MyTrips',
      ],
    }),

    // Démarrer un trajet
    startTrip: builder.mutation<Trip, string>({
      query: (id: string) => ({
        url: `/trips/${id}/start`,
        method: 'PUT',
      }),
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      invalidatesTags: (_result, _error, id: string) => [
        { type: 'Trip', id },
        { type: 'MyTrips', id },
        'Trip',
        'MyTrips',
      ],
    }),

    // Mettre en pause/interrompre un trajet actif
    pauseTrip: builder.mutation<Trip, string>({
      query: (id: string) => ({
        url: `/trips/${id}/pause`,
        method: 'PUT',
      }),
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      invalidatesTags: (_result, _error, id: string) => [
        { type: 'Trip', id },
        { type: 'MyTrips', id },
        'Trip',
        'MyTrips',
      ],
    }),

    // Mettre à jour la position du conducteur
    updateDriverLocation: builder.mutation<
      { tripId: string; coordinates: [number, number]; updatedAt: string },
      { tripId: string; coordinates: [number, number] }
    >({
      query: ({ tripId, coordinates }: { tripId: string; coordinates: [number, number] }) => ({
        url: `/trips/${tripId}/driver-location`,
        method: 'PUT',
        body: { coordinates },
      }),
      invalidatesTags: (_result, _error, { tripId }: { tripId: string }) => [
        { type: 'Trip', id: tripId },
        'Trip',
      ],
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
      }),
      invalidatesTags: (_result, _error, { tripId }: { tripId: string }) => [
        { type: 'Trip', id: tripId },
        'Trip',
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
      }),
      invalidatesTags: (_result, _error, { tripId }) => [
        { type: 'Trip', id: tripId },
        { type: 'MyTrips', id: tripId },
        'Trip',
        'MyTrips',
      ],
    }),
  }),
});

export const {
  useGetTripsQuery,
  useGetAllTripsQuery,
  useLazyGetTripsQuery,
  useGetMyTripsQuery,
  useGetMyRecurringTripsQuery,
  useGetTripByIdQuery,
  useCreateTripMutation,
  useCreateRecurringTripMutation,
  useUpdateTripMutation,
  useDeleteTripMutation,
  useBookTripMutation,
  useSearchTripsByCoordinatesMutation,
  useStartTripMutation,
  usePauseTripMutation,
  usePauseRecurringTripMutation,
  useResumeRecurringTripMutation,
  useUpdateDriverLocationMutation,
  useGetDriverLocationQuery,
  useSetDriverEmergencyContactsMutation,
} = tripApi;



