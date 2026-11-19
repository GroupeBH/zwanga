import type { Booking, TripRequest } from '@/types';
import type { ActivityTrip } from '@/store/api/trip/activityTripMapper';

/** Global/home consumers keep their shared cache subscription, never own a list poll.
 * Selecting data/status explicitly avoids renders for isFetching/timestamp-only changes.
 */
const sharedActivityQueryOptions = {
  pollingInterval: 0,
  refetchOnFocus: false,
  refetchOnReconnect: false,
  refetchOnMountOrArgChange: false,
};
const selectData = <T,>(result: { data?: T; isSuccess: boolean; isLoading: boolean; isError: boolean }) => ({
  data: result.data, isSuccess: result.isSuccess, isLoading: result.isLoading, isError: result.isError,
});
export const sharedTripsOptions = { ...sharedActivityQueryOptions, selectFromResult: selectData<ActivityTrip[]> };
export const sharedBookingsOptions = { ...sharedActivityQueryOptions, selectFromResult: selectData<Booking[]> };
export const sharedRequestsOptions = { ...sharedActivityQueryOptions, selectFromResult: selectData<TripRequest[]> };
