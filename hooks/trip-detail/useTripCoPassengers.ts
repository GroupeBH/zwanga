import { useAppSelector } from '@/store/hooks';
import { useGetTripCoPassengersQuery } from '@/store/api/tripApi';
import { displayReadOptions, useDisplayRefetch } from '@/hooks/useDisplayReads';
import { getTokenSessionVersion } from '@/services/tokenSession';
import type { Booking, Trip } from '@/types';

export function canSeeCoPassengers(trip: Trip | undefined, booking: Booking | null, userId?: string) {
  return Boolean(userId && trip && booking && trip.driverId !== userId && !trip.tripRequestId && !trip.isPrivate &&
    ['upcoming', 'ongoing', 'completed'].includes(trip.status) && !trip.isExpired &&
    booking.tripId === trip.id && booking.passengerId === userId && ['accepted', 'completed'].includes(booking.status));
}

export function useTripCoPassengers(trip: Trip | undefined, booking: Booking | null, active: boolean, expanded: boolean) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const session = getTokenSessionVersion();
  const eligible = canSeeCoPassengers(trip, booking, userId);
  const enabled = eligible && active && expanded && online;
  const tripId = trip?.id ?? '';
  const args = { tripId, viewerId: userId ?? '', session };
  const read = useGetTripCoPassengersQuery(args, {
    ...displayReadOptions(enabled),
    // On-demand reads only: no extra background polling for a passenger directory.
  });
  const refresh = useDisplayRefetch(enabled, `${userId}:${tripId}`, read.refetch);
  const denied = [401, 403, 404, 410].includes(Number((read.error as { status?: unknown } | undefined)?.status));
  // Do not keep identities on screen during a permission recheck, offline or after a denial.
  const participants = enabled && !read.isFetching && !read.isError && read.currentData?.tripId === tripId
    ? read.currentData.participants : undefined;
  return { eligible, online, participants, denied, failed: read.isError, busy: read.isFetching,
    loading: enabled && !participants && !read.isError, refresh };
}
