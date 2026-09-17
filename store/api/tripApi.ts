import { buildGetTripsEndpoints } from './trip/getTrips.endpoints';
import { buildTripHistory } from './trip/history';
import { buildConfirmDriverTripInterruptionEndpoints } from './trip/confirmDriverTripInterruption.endpoints';

export type { TripSearchParams } from './trip/contracts';
export type { TripSearchByPointsPayload } from './trip/contracts';
export type { CreateRecurringTripPayload } from './trip/contracts';

export { mapServerTripToClient } from './trip/tripMapper';

export type { ServerRecurringTripTemplate } from './trip/mappingHelpers';

export type { ServerTrip } from './trip/serverTypes';




import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

export const tripApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    ...buildGetTripsEndpoints(builder),
    ...buildTripHistory(builder),
    ...buildConfirmDriverTripInterruptionEndpoints(builder),
  }),
});

export const {
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

