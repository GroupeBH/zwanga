import { buildGetTripsEndpoints } from './trip/getTrips.endpoints';
import { buildTripHistory } from './trip/history';
import { buildTripDiscovery } from './trip/discovery';
import { buildConfirmDriverTripInterruptionEndpoints } from './trip/confirmDriverTripInterruption.endpoints';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';
import { getTokenSessionVersion } from '@/services/tokenSession';

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

tripApi.enhanceEndpoints({ endpoints: { startTrip: {
  async onQueryStarted(id, { dispatch, queryFulfilled }) {
    const session = getTokenSessionVersion();
    try {
      const { data: trip } = await queryFulfilled;
      if (session !== getTokenSessionVersion()) return;
      dispatch(tripApi.util.updateQueryData('getTripById', id, () => trip));
      dispatch(tripApi.util.updateQueryData('getMyTrips', undefined, trips => {
        const index = trips.findIndex(item => item.id === id);
        if (index >= 0) trips[index] = trip;
      }));
      dispatch(tripApi.util.updateQueryData('getMyActivityTrips', undefined, trips => {
        const current = trips.find(item => item.id === id);
        if (current) Object.assign(current, trip);
      }));
    } catch { /* Do not mark a ride as started before server confirmation. */ }
  },
} } });

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

