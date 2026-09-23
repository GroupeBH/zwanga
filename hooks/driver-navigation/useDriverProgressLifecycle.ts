import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationData } from './useDriverNavigationData';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import { useDriverCompletionActions } from './useDriverCompletionActions';
import { trackingSocket } from '@/services/trackingSocket';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

interface Params {
  mapState: ReturnType<typeof useDriverNavigationMapState>;
  foregroundCompletion: { checkTripCompletionFromRestOnForeground: () => Promise<void>; };
  data: ReturnType<typeof useDriverNavigationData>;
  refs: ReturnType<typeof useDriverNavigationRefs>;
  completion: ReturnType<typeof useDriverCompletionActions>;
}

export function useDriverProgressLifecycle({
  mapState,
  foregroundCompletion,
  data,
  refs,
  completion,
}: Params) {
  const latest = useRef({ data, mapState });
  latest.current = { data, mapState };
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const { data, mapState } = latest.current;
      const previousState = mapState.appStateRef.current;
      mapState.appStateRef.current = nextState;

      if (
        (nextState === 'background' || nextState === 'inactive') &&
        mapState.isTripOngoingRef.current
      ) {
        mapState.completedDuringInactiveCandidateRef.current = true;
      }

      if (
        nextState === 'active' &&
        (previousState === 'background' || previousState === 'inactive')
      ) {
        // Completion recovery runs once through the active-screen effect below.
        if (data.isFocused && data.isTripOngoing && data.tripId) {
          void trackingSocket.resumeBoardingDetection(data.tripId).catch((error) => {
            console.warn('[Navigation] Reprise détection embarquement impossible:', error);
          });
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const hasArrival = Boolean(data.tripArrivalCoordinate);
  const { checkTripCompletionFromRestOnForeground } = foregroundCompletion;
  useEffect(() => {
    if (!data.isScreenActive || !data.isTripOngoing || !hasArrival) {
      return;
    }

    void checkTripCompletionFromRestOnForeground();
  }, [checkTripCompletionFromRestOnForeground, data.isScreenActive, data.isTripOngoing, data.tripId, hasArrival]);

  const { previousTripStatusRef } = refs;
  const { completedDuringInactiveCandidateRef, setPickupNoticeCountdown } = mapState;
  const { presentCompletedTripFromServerSync } = completion;
  useEffect(() => {
    const previousStatus = previousTripStatusRef.current;
    const currentStatus = data.trip?.status ?? null;

    if (previousStatus === 'ongoing' && currentStatus === 'completed' && data.trip) {
      presentCompletedTripFromServerSync(data.trip, {
        completedWhileAppInactive: completedDuringInactiveCandidateRef.current,
      });
    }

    previousTripStatusRef.current = currentStatus;
  }, [presentCompletedTripFromServerSync, data.trip, previousTripStatusRef, completedDuringInactiveCandidateRef]);

  const noticeExpiresAt = mapState.pickupNotice?.expiresAt;
  useEffect(() => {
    if (!data.isScreenActive || !noticeExpiresAt) {
      setPickupNoticeCountdown(null);
      return;
    }

    const expiresAt = new Date(noticeExpiresAt).getTime();
    if (!Number.isFinite(expiresAt)) {
      setPickupNoticeCountdown(null);
      return;
    }

    let interval: ReturnType<typeof setInterval> | undefined;
    const updateCountdown = () => {
      const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setPickupNoticeCountdown(remainingSeconds);
      if (remainingSeconds === 0 && interval) clearInterval(interval);
    };

    updateCountdown();
    if (expiresAt > Date.now()) interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [data.isScreenActive, noticeExpiresAt, setPickupNoticeCountdown]);

  return {

  };
}
