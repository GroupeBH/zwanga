import {
  CreateTripRequestPayload,
  RecommendTripRequestPricePayload,
  TripRequestPriceRecommendation,
  TripRequestVehicleOptions,
  tripRequestListTag,
  myTripRequestsListTag,
  driverOfferListTag,
  myDriverOffersListTag,
  tripListTag,
  myTripsListTag,
  bookingListTag,
  CreateDriverOfferPayload,
  AcceptDriverOfferPayload,
  AcceptTripRequestPayload,
} from './trip-request/contracts';

export type { RecommendTripRequestPricePayload } from './trip-request/contracts';
export type { TripRequestPriceRecommendation } from './trip-request/contracts';
export type { TripRequestVehiclePriceOption } from './trip-request/contracts';
export type { TripRequestVehicleOptions } from './trip-request/contracts';
import { mapServerTripRequestToClient, mapServerDriverOfferToClient, mapServerDriverOfferWithTripRequestToClient } from './trip-request/requestMapper';
import { ServerTripRequest, ServerDriverOffer, ServerDriverOfferWithTripRequest } from './trip-request/serverTypes';
import type { DriverOffer, DriverOfferWithTripRequest, Trip, TripRequest } from '@/types';
import { baseApi } from './baseApi';
import type { ServerTrip } from './tripApi';
import { mapServerTripToClient } from './tripApi';
import type { BaseEndpointBuilder } from './types';

import { CRITICAL_MUTATION_TIMEOUT_MS } from '@/constants/network';

export const tripRequestApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    // Créer une demande de trajet
    createTripRequest: builder.mutation<TripRequest, CreateTripRequestPayload>({
      query: (payload: CreateTripRequestPayload) => ({
        url: '/trip-requests',
        method: 'POST',
        body: payload,
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (
        response: ServerTripRequest | { data?: ServerTripRequest; tripRequest?: ServerTripRequest },
      ) => {
        const wrappedResponse = response as { data?: ServerTripRequest; tripRequest?: ServerTripRequest };
        const request = wrappedResponse.data ?? wrappedResponse.tripRequest ?? (response as ServerTripRequest);
        // Some production deployments return only the created id. The detail
        // screen will fetch the complete object after navigation.
        if (request?.id && !request.passenger) {
          return { id: request.id } as TripRequest;
        }
        return mapServerTripRequestToClient(request);
      },
      invalidatesTags: [tripRequestListTag, myTripRequestsListTag],
    }),

    // Récupérer toutes les demandes de trajet disponibles (pour les drivers)
    recommendTripRequestPrice: builder.mutation<TripRequestPriceRecommendation, RecommendTripRequestPricePayload>({
      query: (payload: RecommendTripRequestPricePayload) => ({
        url: '/trip-requests/recommended-price',
        method: 'POST',
        body: payload,
      }),
    }),

    tripRequestVehicleOptions: builder.query<TripRequestVehicleOptions, RecommendTripRequestPricePayload>({
      keepUnusedDataFor: 30,
      query: (body) => ({ url: '/trip-requests/vehicle-options', method: 'POST', body }),
    }),

    getTripRequestVehicleOptions: builder.mutation<TripRequestVehicleOptions, RecommendTripRequestPricePayload>({
      query: (payload: RecommendTripRequestPricePayload) => ({
        url: '/trip-requests/vehicle-options',
        method: 'POST',
        body: payload,
      }),
    }),

    getAvailableTripRequests: builder.query<TripRequest[], void>({
      query: () => '/trip-requests',
      transformResponse: (response: ServerTripRequest[]) =>
        response.map(mapServerTripRequestToClient),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'TripRequest' as const, id })),
              tripRequestListTag,
            ]
          : [tripRequestListTag],
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
              myTripRequestsListTag,
            ]
          : [myTripRequestsListTag],
    }),

    // Récupérer une demande de trajet par ID
    getTripRequestById: builder.query<TripRequest, string>({
      query: (id: string) => `/trip-requests/${id}`,
      transformResponse: (response: ServerTripRequest) => mapServerTripRequestToClient(response),
      providesTags: (_result, _error, id: string) => [{ type: 'TripRequest', id }],
    }),

    // Mettre à jour une demande de trajet
    updateTripRequest: builder.mutation<TripRequest, { id: string; payload: Partial<CreateTripRequestPayload> }>({
      query: ({ id, payload }: { id: string; payload: Partial<CreateTripRequestPayload> }) => ({
        url: `/trip-requests/${id}`,
        method: 'PUT',
        body: payload,
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerTripRequest) => mapServerTripRequestToClient(response),
      invalidatesTags: (_result, _error, { id }: { id: string }) => [
        { type: 'TripRequest', id },
        tripRequestListTag,
        myTripRequestsListTag,
      ],
    }),

    // Annuler une demande de trajet
    cancelTripRequest: builder.mutation<void, string>({
      query: (id: string) => ({
        url: `/trip-requests/${id}`,
        method: 'DELETE',
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      invalidatesTags: (_result, _error, id: string) => [
        { type: 'TripRequest', id },
        tripRequestListTag,
        myTripRequestsListTag,
        tripListTag,
        myTripsListTag,
        bookingListTag,
      ],
    }),

    releaseOverdueDriver: builder.mutation<TripRequest, string>({
      query: (id: string) => ({
        url: `/trip-requests/${id}/release-driver`,
        method: 'PUT',
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerTripRequest) =>
        mapServerTripRequestToClient(response),
      invalidatesTags: (_result, _error, id: string) => [
        { type: 'TripRequest', id },
        tripRequestListTag,
        myTripRequestsListTag,
        driverOfferListTag,
        myDriverOffersListTag,
        tripListTag,
        myTripsListTag,
        bookingListTag,
      ],
    }),

    // Créer une offre de driver pour une demande de trajet
    createDriverOffer: builder.mutation<DriverOffer, { tripRequestId: string; payload: CreateDriverOfferPayload }>({
      query: ({ tripRequestId, payload }: { tripRequestId: string; payload: CreateDriverOfferPayload }) => ({
        url: `/trip-requests/${tripRequestId}/offers`,
        method: 'POST',
        body: payload,
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerDriverOffer) => mapServerDriverOfferToClient(response),
      invalidatesTags: (_result, _error, { tripRequestId }: { tripRequestId: string }) => [
        { type: 'TripRequest', id: tripRequestId },
        // Ne pas invalider 'TripRequest' globalement pour éviter de refetch toutes les demandes
        // Le backend devrait continuer à renvoyer les demandes tant qu'aucune offre n'est acceptée
        driverOfferListTag,
        myDriverOffersListTag,
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
              driverOfferListTag,
              myDriverOffersListTag,
            ]
          : [myDriverOffersListTag, driverOfferListTag],
    }),

    // Accepter une offre de driver
    acceptDriverOffer: builder.mutation<TripRequest, { tripRequestId: string; payload: AcceptDriverOfferPayload }>({
      query: ({ tripRequestId, payload }: { tripRequestId: string; payload: AcceptDriverOfferPayload }) => ({
        url: `/trip-requests/${tripRequestId}/accept-offer`,
        method: 'POST',
        body: payload,
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerTripRequest) => mapServerTripRequestToClient(response),
      invalidatesTags: (_result, _error, { tripRequestId }: { tripRequestId: string }) => [
        { type: 'TripRequest', id: tripRequestId },
        tripRequestListTag,
        myTripRequestsListTag,
        driverOfferListTag,
        myDriverOffersListTag,
        tripListTag,
      ],
    }),

    // Rejeter une offre de driver (si le backend le supporte)
    rejectDriverOffer: builder.mutation<DriverOffer, { tripRequestId: string; offerId: string }>({
      query: ({ tripRequestId, offerId }: { tripRequestId: string; offerId: string }) => ({
        url: `/trip-requests/${tripRequestId}/offers/${offerId}/reject`,
        method: 'POST',
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: ServerDriverOffer) => mapServerDriverOfferToClient(response),
      invalidatesTags: (_result, _error, { tripRequestId }: { tripRequestId: string }) => [
        { type: 'TripRequest', id: tripRequestId },
        tripRequestListTag,
        myTripRequestsListTag,
        driverOfferListTag,
        myDriverOffersListTag,
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
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: { trip: ServerTrip; tripRequest: ServerTripRequest }) => ({
        trip: mapServerTripToClient(response.trip),
        tripRequest: mapServerTripRequestToClient(response.tripRequest),
      }),
      invalidatesTags: (_result, _error, tripRequestId: string) => [
        { type: 'TripRequest', id: tripRequestId },
        tripRequestListTag,
        myTripRequestsListTag,
        tripListTag,
        myTripsListTag,
        bookingListTag,
      ],
    }),

    // Accepter directement une demande de trajet (style Uber/Bolt)
    // Crée automatiquement un trajet et une réservation pour le passager
    acceptTripRequest: builder.mutation<
      { trip: Trip; tripRequest: TripRequest },
      { tripRequestId: string; payload: AcceptTripRequestPayload }
    >({
      query: ({ tripRequestId, payload }: { tripRequestId: string; payload: AcceptTripRequestPayload }) => ({
        url: `/trip-requests/${tripRequestId}/accept`,
        method: 'POST',
        body: payload,
        timeout: CRITICAL_MUTATION_TIMEOUT_MS,
      }),
      transformResponse: (response: { trip: ServerTrip; tripRequest: ServerTripRequest }) => ({
        trip: mapServerTripToClient(response.trip),
        tripRequest: mapServerTripRequestToClient(response.tripRequest),
      }),
      invalidatesTags: (_result, _error, { tripRequestId }: { tripRequestId: string }) => [
        { type: 'TripRequest', id: tripRequestId },
        tripRequestListTag,
        myTripRequestsListTag,
        tripListTag,
        myTripsListTag,
        bookingListTag,
        driverOfferListTag,
        myDriverOffersListTag,
      ],
    }),
  }),
});

export const {
    useCreateTripRequestMutation,
    useTripRequestVehicleOptionsQuery,
  useRecommendTripRequestPriceMutation,
  useGetTripRequestVehicleOptionsMutation,
  useGetAvailableTripRequestsQuery,
  useGetMyTripRequestsQuery,
  useLazyGetMyTripRequestsQuery,
  useGetTripRequestByIdQuery,
  useUpdateTripRequestMutation,
  useCancelTripRequestMutation,
  useReleaseOverdueDriverMutation,
  useCreateDriverOfferMutation,
  useGetMyDriverOffersQuery,
  useAcceptDriverOfferMutation,
  useRejectDriverOfferMutation,
  useStartTripFromRequestMutation,
  useAcceptTripRequestMutation,
} = tripRequestApi;
