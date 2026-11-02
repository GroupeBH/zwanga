import type { TripRequest, TripRequestVehicleType } from '@/types';
import { baseApi } from './baseApi';
import { mapServerTripRequestToClient } from './trip-request/requestMapper';
import type { ServerTripRequest } from './trip-request/serverTypes';
import { compatibleVehiclePayload, vehicleSelectionError } from '@/features/trip-request/vehiclePayload';

export type RequestDriverChoice = { id: string; name: string; vehicle: string; distanceKm: number | string; vehicleType?: TripRequestVehicleType };
export type SelectedRequestDriver = RequestDriverChoice & { vehicleType: TripRequestVehicleType };
export type DriverChoiceQuery = { latitude: number; longitude: number; seats: number; vehicleType: TripRequestVehicleType; vehicleTypes?: TripRequestVehicleType[]; search?: string };

export const requestDriverApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    requestDriverChoices: builder.query<RequestDriverChoice[], DriverChoiceQuery>({
      query: (input) => {
        const { vehicleTypes, ...params } = compatibleVehiclePayload(input);
        return { url: '/trip-requests/driver-choices',
          params: { ...params, ...(vehicleTypes?.length ? { vehicleTypes: vehicleTypes.join(',') } : {}) }, timeout: 10000 };
      },
      transformErrorResponse: vehicleSelectionError,
      keepUnusedDataFor: 15,
    }),
    targetRequestMapDriver: builder.mutation<TripRequest, { id: string; markerId: string; expectedUpdatedAt: string }>({
      query: ({ id, ...body }) => ({ url: `/trip-requests/${id}/target-map-driver`, method: 'POST', body, timeout: 15000 }),
      transformResponse: (response: ServerTripRequest) => mapServerTripRequestToClient(response),
      invalidatesTags: () => ['TripRequest', 'MyTripRequests', 'AccountActivity', 'Notification'],
    }),
    changeRequestDriver: builder.mutation<TripRequest, { id: string; selectedDriverId: string; selectedAt: string }>({
      query: ({ id, ...body }) => ({ url: `/trip-requests/${id}/change-driver`, method: 'PUT', body, timeout: 15000 }),
      transformResponse: (response: ServerTripRequest) => mapServerTripRequestToClient(response),
      // Refresh on an ambiguous timeout too: the transaction may have committed.
      invalidatesTags: () => ['TripRequest', 'MyTripRequests', 'AccountActivity', 'Notification'],
    }),
    openRequestToNearbyDrivers: builder.mutation<TripRequest, string>({
      query: id => ({ url: `/trip-requests/${id}/open-search`, method: 'POST', timeout: 10000 }),
      transformResponse: (response: ServerTripRequest) => mapServerTripRequestToClient(response),
      invalidatesTags: (_result, error) => error ? [] : ['TripRequest', 'MyTripRequests', 'AccountActivity', 'Notification'],
    }),
  }),
});
export const { useRequestDriverChoicesQuery, useOpenRequestToNearbyDriversMutation,
  useTargetRequestMapDriverMutation, useChangeRequestDriverMutation } = requestDriverApi;
