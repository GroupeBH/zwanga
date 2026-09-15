import {
  cleanObject,
  tripListTag,
  myTripsListTag,
  recurringTripListTag,
  bookingListTag,
  TripSearchParams,
  TripSearchByPointsPayload,
  CreateTripPayload,
  CreateRecurringTripPayload,
  UpdateTripRequest,
} from './contracts';
import { mapServerTripToClient, mapServerRecurringTripToClient } from './tripMapper';
import { ServerRecurringTripTemplate } from './mappingHelpers';
import { ServerTrip } from './serverTypes';
import type { InterruptionFareQuote, RecurringTripTemplate, Trip, TripInterruptionReason } from '../../../types';
import { CRITICAL_MUTATION_TIMEOUT_MS } from '@/constants/network';
import type { BaseEndpointBuilder } from '../types';

export function buildGetTripsEndpoints(builder: BaseEndpointBuilder) {
  return {
// Rechercher des trajets avec filtres
    getTrips: builder.query<Trip[], TripSearchParams>({
      query: (params: TripSearchParams) => ({
        url: '/trips',
        params: cleanObject(params),
      }),
      transformResponse: (response: ServerTrip[]) => response.map(mapServerTripToClient),
      providesTags: (result: Trip[] | undefined) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Trip' as const, id })), tripListTag]
          : [tripListTag],
    }),
getAllTrips: builder.query<Trip[], any>({
      query: () => ({
        url: '/trips/all-trips',
      }),
      transformResponse: (response: ServerTrip[]) => response.map(mapServerTripToClient),
      providesTags: (result: Trip[] | undefined) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Trip' as const, id })), tripListTag]
          : [tripListTag],
    }),
getMyTrips: builder.query<Trip[], void>({
      query: () => ({
        url: '/trips/my-trips',
      }),
      transformResponse: (response: ServerTrip[]) => response.map(mapServerTripToClient),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'MyTrips' as const, id })), myTripsListTag]
          : [myTripsListTag],
    }),
getMyRecurringTrips: builder.query<RecurringTripTemplate[], void>({
      query: () => ({
        url: '/trips/recurring/my',
      }),
      transformResponse: (response: ServerRecurringTripTemplate[]) =>
        response.map(mapServerRecurringTripToClient),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'RecurringTrip' as const, id })), recurringTripListTag]
          : [recurringTripListTag],
    }),
searchTripsByCoordinates: builder.mutation<Trip[], TripSearchByPointsPayload>({
      query: (body: TripSearchByPointsPayload) => ({
        url: '/trips/search/coordinates',
        method: 'POST',
        body: cleanObject(body),
      }),
      transformResponse: (response: ServerTrip[]) => response.map(mapServerTripToClient),
    }),
getTripsByCoordinates: builder.query<Trip[], TripSearchByPointsPayload>({
      query: (body: TripSearchByPointsPayload) => ({
        url: '/trips/search/coordinates',
        method: 'POST',
        body: cleanObject(body),
      }),
      transformResponse: (response: ServerTrip[]) => response.map(mapServerTripToClient),
      providesTags: (result: Trip[] | undefined) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Trip' as const, id })), tripListTag]
          : [tripListTag],
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
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      invalidatesTags: [tripListTag, myTripsListTag],
    }),
createRecurringTrip: builder.mutation<RecurringTripTemplate, CreateRecurringTripPayload>({
      query: (trip: CreateRecurringTripPayload) => ({
        url: '/trips/recurring',
        method: 'POST',
        body: trip,
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerRecurringTripTemplate) =>
        mapServerRecurringTripToClient(response),
      invalidatesTags: [recurringTripListTag, tripListTag, myTripsListTag],
    }),
pauseRecurringTrip: builder.mutation<RecurringTripTemplate, string>({
      query: (id: string) => ({
        url: `/trips/recurring/${id}/pause`,
        method: 'PUT',
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerRecurringTripTemplate) =>
        mapServerRecurringTripToClient(response),
      invalidatesTags: (_result, _error, id) => [
        { type: 'RecurringTrip', id },
        recurringTripListTag,
        tripListTag,
        myTripsListTag,
      ],
    }),
resumeRecurringTrip: builder.mutation<RecurringTripTemplate, string>({
      query: (id: string) => ({
        url: `/trips/recurring/${id}/resume`,
        method: 'PUT',
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerRecurringTripTemplate) =>
        mapServerRecurringTripToClient(response),
      invalidatesTags: (_result, _error, id) => [
        { type: 'RecurringTrip', id },
        recurringTripListTag,
        tripListTag,
        myTripsListTag,
      ],
    }),
// Mettre à jour un trajet existant
    updateTrip: builder.mutation<Trip, { id: string; updates: UpdateTripRequest }>({
      query: ({ id, updates }: { id: string; updates: UpdateTripRequest }) => ({
        url: `/trips/${id}`,
        method: 'PUT',
        body: updates,
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      invalidatesTags: (_result, _error, { id }: { id: string }) => [
        { type: 'Trip', id },
        { type: 'MyTrips', id },
        tripListTag,
        myTripsListTag,
      ],
    }),
// Annuler un trajet
    deleteTrip: builder.mutation<void, string>({
      query: (id: string) => ({
        url: `/trips/${id}`,
        method: 'DELETE',
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      invalidatesTags: (_result, _error, id: string) => [
        { type: 'Trip', id },
        { type: 'MyTrips', id },
        tripListTag,
        myTripsListTag,
      ],
    }),
// Démarrer un trajet
    startTrip: builder.mutation<Trip, string>({
      query: (id: string) => ({
        url: `/trips/${id}/start`,
        method: 'PUT',
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      invalidatesTags: (_result, _error, id: string) => [
        { type: 'Trip', id },
        { type: 'MyTrips', id },
        tripListTag,
        myTripsListTag,
        bookingListTag,
      ],
    }),
// Mettre en pause/interrompre un trajet actif
    pauseTrip: builder.mutation<Trip, string>({
      query: (id: string) => ({
        url: `/trips/${id}/pause`,
        method: 'PUT',
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      invalidatesTags: (_result, _error, id: string) => [
        { type: 'Trip', id },
        { type: 'MyTrips', id },
        tripListTag,
        myTripsListTag,
        bookingListTag,
      ],
    }),
requestDriverTripInterruption: builder.mutation<
      Trip,
      {
        tripId: string;
        reason: TripInterruptionReason;
        note?: string;
        coordinates?: { latitude: number; longitude: number } | null;
      }
    >({
      query: ({ tripId, ...body }) => ({
        url: `/trips/${tripId}/interruption-request`,
        method: 'POST',
        body,
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
cancelDriverTripInterruption: builder.mutation<Trip, string>({
      query: (tripId: string) => ({
        url: `/trips/${tripId}/interruption-request/cancel`,
        method: 'PUT',
        body: {},
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerTrip) => mapServerTripToClient(response),
      invalidatesTags: (_result, _error, tripId) => [
        { type: 'Trip', id: tripId },
        { type: 'MyTrips', id: tripId },
        tripListTag,
        myTripsListTag,
      ],
    }),
getDriverInterruptionFare: builder.query<InterruptionFareQuote, { tripId: string; requestId: string; bookingId: string }>({
      query: ({ tripId, ...params }) => ({ url: `/trips/${tripId}/interruption-request/fare`, params }),
      keepUnusedDataFor: 30,
    }),
decideDriverInterruption: builder.mutation<
      { bookingId: string; requestId: string; decision: 'wait' | 'stop' },
      { tripId: string; requestId: string; bookingId: string; decision: 'wait' | 'stop'; quoteId?: string }
    >({
      query: ({ tripId, ...body }) => ({ url: `/trips/${tripId}/interruption-request/decision`, method: 'PUT', body, timeout: CRITICAL_MUTATION_TIMEOUT_MS }),
      invalidatesTags: (_result, _error, { tripId }) => [
        { type: 'Trip', id: tripId }, 'Booking', 'Wallet', tripListTag, myTripsListTag,
      ],
    })
  };
}
