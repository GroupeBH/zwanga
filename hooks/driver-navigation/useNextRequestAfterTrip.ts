import { useEffect, useRef, useState } from 'react';
import type { Trip, TripRequest } from '@/types';
import type { MapCoordinate } from '@/utils/tripCoordinates';
import { ownsTrip } from '@/features/activity/tripParticipation';
import { homePriorityKeys } from '@/features/home/homePriorityDismissal';
import { HOME_ACTIVITY_POLL_MS } from '@/features/home/homeModel';
import { isTripRequestWithinAcceptanceWindow } from '@/features/trip-request/requestExpiration';
import { isRequestUnassigned, rankRequestsByProximity } from '@/features/trip-request/requestPriority';
import { useHomePriorityDismissals } from '@/hooks/home/useHomePriorityDismissals';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppSelector } from '@/store/hooks';
import { useGetHomeTripRequestsQuery } from '@/store/api/tripRequestApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { isDriverAccount } from '@/utils/accountRole';

type Props = { trip?: Trip; active: boolean; blocked: boolean; coordinate?: MapCoordinate | null };

/** Observe a real ongoing -> completed transition, not the opening of an old trip.
 * Reuse the Home feed, local ignores and decision modal; never trigger a sound or mutation here. */
export function useNextRequestAfterTrip({ trip, active, blocked, coordinate }: Props) {
  const user = useAppSelector(state => state.auth.user);
  const appActive = useAppIsActive();
  const scope = `${getTokenSessionVersion()}:${user?.id}:${trip?.id}`;
  const seen = useRef({ scope, ongoing: false });
  if (seen.current.scope !== scope) seen.current = { scope, ongoing: false };
  const [handledScope, setHandledScope] = useState('');
  const owner = isDriverAccount(user) && ownsTrip(trip, user?.id);
  useEffect(() => {
    if (!owner || trip?.status === 'cancelled') seen.current.ongoing = false;
    else if (trip?.status === 'ongoing') seen.current.ongoing = true;
  }, [owner, scope, trip?.status]);
  const enabled = active && appActive && !blocked && owner && seen.current.ongoing && trip?.status === 'completed';
  const readsEnabled = useDisplayReadsEnabled(enabled && handledScope !== scope);
  const shown = useRef<{ scope: string; request: TripRequest | null }>({ scope, request: null });
  if (shown.current.scope !== scope || !readsEnabled) shown.current = { scope, request: null };
  const { currentData, isFetching, isError, isSuccess } = useGetHomeTripRequestsQuery(undefined,
    displayReadOptions(readsEnabled, HOME_ACTIVITY_POLL_MS));
  const { hiddenHomePriorities, dismissPriority } = useHomePriorityDismissals(user?.id);
  // Never use a cached list while the post-completion refresh is still pending or failed.
  const eligible = readsEnabled && isSuccess && !isFetching && !isError ? (currentData ?? []).filter(request =>
    request.passengerId !== user?.id && request.tripId !== trip?.id && isRequestUnassigned(request)
    && isTripRequestWithinAcceptanceWindow(request)
    && !hiddenHomePriorities[homePriorityKeys.nearbyRequest(request)]
    && !request.offers?.some(offer => offer.driverId === user?.id && offer.status === 'pending')) : [];
  if (readsEnabled && !isFetching) {
    // Keep the visible command stable through ordinary refreshes/GPS movement.
    // A confirmed removal, error or expiry still removes it, and resume requires a fresh list.
    shown.current.request = eligible.find(item => item.id === shown.current.request?.id)
      ?? rankRequestsByProximity(eligible, coordinate)[0] ?? null;
  }
  const selected = shown.current.request;
  const request = selected && isTripRequestWithinAcceptanceWindow(selected) ? selected : null;
  return { request, enabled, userId: user?.id, dismissPriority: (key: string) => {
    dismissPriority(key);
    setHandledScope(scope);
    // Keep enabled until the modal's close callback can navigate after acceptance.
    // Only its feed stops: ignoring must not open a succession of other commands.
  } };
}
