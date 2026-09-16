import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationData } from './useDriverNavigationData';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import { useDriverCompletionActions } from './useDriverCompletionActions';
import { trackingSocket } from '@/services/trackingSocket';
import { useEffect } from 'react';
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
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
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
        void foregroundCompletion.checkTripCompletionFromRestOnForeground();
        if (data.tripId) {
          void trackingSocket.resumeBoardingDetection(data.tripId).catch((error) => {
            console.warn('[Navigation] Reprise détection embarquement impossible:', error);
          });
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [foregroundCompletion.checkTripCompletionFromRestOnForeground, data.tripId]);

  useEffect(() => {
    if (!data.isTripOngoing || !data.tripArrivalCoordinate) {
      return;
    }

    void foregroundCompletion.checkTripCompletionFromRestOnForeground();
  }, [foregroundCompletion.checkTripCompletionFromRestOnForeground, data.isTripOngoing, data.tripArrivalCoordinate]);

  useEffect(() => {
    const previousStatus = refs.previousTripStatusRef.current;
    const currentStatus = data.trip?.status ?? null;

    if (previousStatus === 'ongoing' && currentStatus === 'completed' && data.trip) {
      completion.presentCompletedTripFromServerSync(data.trip, {
        completedWhileAppInactive: mapState.completedDuringInactiveCandidateRef.current,
      });
    }

    refs.previousTripStatusRef.current = currentStatus;
  }, [completion.presentCompletedTripFromServerSync, data.trip]);

  useEffect(() => {
    if (!mapState.pickupNotice?.expiresAt) {
      mapState.setPickupNoticeCountdown(null);
      return;
    }

    const expiresAt = new Date(mapState.pickupNotice.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) {
      mapState.setPickupNoticeCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      mapState.setPickupNoticeCountdown(remainingSeconds);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [mapState.pickupNotice?.expiresAt]);

  return {

  };
}
