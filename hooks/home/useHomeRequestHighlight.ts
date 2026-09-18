import { isTripRequestWithinAcceptanceWindow } from '@/features/home/homeModel';
import { getRequestDepartureDistance, isRequestUnassigned } from '@/features/trip-request/requestPriority';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { startHomeRequestHighlight } from '@/store/slices/homeRequestHighlightsSlice';
import type { TripRequest } from '@/types';
import type { MapCoordinate } from '@/utils/tripCoordinates';
import { useEffect, useState } from 'react';
import { EMPTY_HIDDEN_HOME_PRIORITIES, homePriorityKeys, type HiddenHomePriorities } from '@/features/home/homePriorityDismissal';

type Props = {
  enabled: boolean;
  userId?: string;
  requests: TripRequest[];
  driverCoordinate: MapCoordinate | null;
  hiddenHomePriorities?: HiddenHomePriorities;
};

export function useHomeRequestHighlight({ enabled, userId, requests, driverCoordinate, hiddenHomePriorities = EMPTY_HIDDEN_HOME_PRIORITIES }: Props) {
  const dispatch = useAppDispatch();
  const appActive = useAppIsActive();
  const authenticatedUserId = useAppSelector(state => state.auth.user?.id);
  const [, forceUpdate] = useState(0);
  const candidate = requests.find(request => !hiddenHomePriorities[homePriorityKeys.nearbyRequest(request)]) ?? null;
  const now = Date.now();
  const canShow = enabled && appActive && Boolean(userId && userId === authenticatedUserId)
    && candidate !== null && candidate.passengerId !== userId
    && isRequestUnassigned(candidate) && isTripRequestWithinAcceptanceWindow(candidate, now);
  const requestId = canShow ? candidate?.id : undefined;
  const expiresAt = useAppSelector(state => (
    requestId && state.homeRequestHighlights.userId === userId
      ? state.homeRequestHighlights.expiresAtById[requestId]
      : undefined
  ));

  useEffect(() => {
    if (requestId && userId && expiresAt === undefined) {
      dispatch(startHomeRequestHighlight({ requestId, userId, now: Date.now() }));
    }
  }, [dispatch, expiresAt, requestId, userId]);

  useEffect(() => {
    if (!requestId || expiresAt === undefined) return;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return;
    // One timeout at expiry, not an interval that redraws Home every second.
    const timer = setTimeout(() => forceUpdate(value => value + 1), remaining);
    return () => clearTimeout(timer);
  }, [expiresAt, requestId]);

  const highlightedDriverRequest = canShow && expiresAt !== undefined && expiresAt > now ? candidate : null;
  return {
    highlightedDriverRequest,
    highlightedRequestDistance: highlightedDriverRequest
      ? getRequestDepartureDistance(highlightedDriverRequest, driverCoordinate)
      : null,
  };
}
