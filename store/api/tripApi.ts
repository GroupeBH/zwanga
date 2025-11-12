import { baseApi } from './baseApi';
import type { Trip } from '../../types';

/**
 * API trajets
 * Gère la création, recherche, réservation et gestion des trajets
 */
export const tripApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Rechercher des trajets avec filtres
    getTrips: builder.query<Trip[], {
      departure?: string;
      arrival?: string;
      vehicleType?: string;
      date?: string;
    }>({
      query: (params) => ({
        url: '/trips',
        params,
      }),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Trip' as const, id })), 'Trip']
          : ['Trip'],
    }),

    // Récupérer un trajet par son ID
    getTripById: builder.query<Trip, string>({
      query: (id) => `/trips/${id}`,
      providesTags: (result, error, id) => [{ type: 'Trip', id }],
    }),

    // Créer un nouveau trajet
    createTrip: builder.mutation<Trip, Omit<Trip, 'id' | 'driverId' | 'driverName' | 'driverRating'>>({
      query: (trip) => ({
        url: '/trips',
        method: 'POST',
        body: trip,
      }),
      invalidatesTags: ['Trip'],
    }),

    // Mettre à jour un trajet existant
    updateTrip: builder.mutation<Trip, { id: string; updates: Partial<Trip> }>({
      query: ({ id, updates }) => ({
        url: `/trips/${id}`,
        method: 'PATCH',
        body: updates,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Trip', id }, 'Trip'],
    }),

    // Annuler un trajet
    cancelTrip: builder.mutation<void, string>({
      query: (id) => ({
        url: `/trips/${id}/cancel`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, id) => [{ type: 'Trip', id }, 'Trip'],
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
  useGetTripByIdQuery,
  useCreateTripMutation,
  useUpdateTripMutation,
  useCancelTripMutation,
  useBookTripMutation,
} = tripApi;


