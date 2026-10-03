import { buildGetTripsEndpoints } from './trip/getTrips.endpoints';
import { buildTripHistory } from './trip/history';
import { buildTripDiscovery } from './trip/discovery';
import { buildConfirmDriverTripInterruptionEndpoints } from './trip/confirmDriverTripInterruption.endpoints';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

export type { TripSearchParams } from './trip/contracts';
export type { TripSearchByPointsPayload } from './trip/contracts';
export type { CreateRecurringTripPayload } from './trip/contracts';

export { mapServerTripToClient } from './trip/tripMapper';

export type { ServerRecurringTripTemplate } from './trip/mappingHelpers';

export type { ServerTrip } from './trip/serverTypes';





export const tripApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    ...buildGetTripsEndpoints(builder),
    ...buildTripHistory(builder),
    ...buildTripDiscovery(builder),
    ...buildConfirmDriverTripInterruptionEndpoints(builder),
  }),
});

export const {
  useGetTripDiscoveryInfiniteQuery,
  useGetMyTripHistoryInfiniteQuery,
  useGetMyActivityTripsQuery,
  useGetTripsQuery,
  useGetTripsByCoordinatesQuery,
  useGetAllTripsQuery,
  useLazyGetTripsQuery,
  useGetMyTripsQuery,
  useLazyGetMyTripsQuery,
  useGetMyRecurringTripsQuery,
  useLazyGetMyRecurringTripsQuery,
  useGetTripByIdQuery,
  useCreateTripMutation,
  useCreateRecurringTripMutation,
  useUpdateTripMutation,
  useDeleteTripMutation,
  useBookTripMutation,
  useSearchTripsByCoordinatesMutation,
  useStartTripMutation,
  usePauseTripMutation,
  useRequestDriverTripInterruptionMutation,
  useCancelDriverTripInterruptionMutation,
  useConfirmDriverTripInterruptionMutation,
  useGetDriverInterruptionFareQuery,
  useDecideDriverInterruptionMutation,
  useRejectDriverTripInterruptionMutation,
  useCompleteTripMutation,
  usePauseRecurringTripMutation,
  useResumeRecurringTripMutation,
  useUpdateDriverLocationMutation,
  useGetDriverLocationQuery,
  useLazyGetDriverLocationQuery,
  useSetDriverEmergencyContactsMutation,
} = tripApi;

