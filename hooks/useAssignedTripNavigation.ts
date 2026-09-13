import type { Router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Trip, TripRequest } from '@/types';
import {
  canUseCachedRequestLink,
  getAssignedPassengerTripId,
  hasAssignedTripStarted,
} from '@/features/trip-request/assignedTripNavigation';

type Props = {
  requestId: string | undefined;
  tripRequest: TripRequest | undefined;
  assignedTrip: Trip | undefined;
  userId: string | undefined;
  requestError?: unknown;
  tripError?: unknown;
  isScreenActive: boolean;
  router: Router;
};

/** No extra request or polling: follow the existing RTK Query subscriptions. */
export function useAssignedTripNavigation({
  requestId, tripRequest, assignedTrip, userId, requestError, tripError, isScreenActive, router,
}: Props) {
  const passengerTripId = getAssignedPassengerTripId(requestId, tripRequest, userId, requestError);
  const shouldOpenTrip = isScreenActive && canUseCachedRequestLink(tripError) &&
    hasAssignedTripStarted(passengerTripId, assignedTrip);
  const navigationKey = shouldOpenTrip ? `${userId}:${requestId}:${passengerTripId}` : null;
  const lastNavigationKey = useRef<string | null>(null);
  const [failedNavigationKey, setFailedNavigationKey] = useState<string | null>(null);

  useEffect(() => {
    if (!navigationKey || navigationKey === lastNavigationKey.current) return;
    // The screen renders its loading state first, releasing any expanded native map on iOS.
    const timer = setTimeout(() => {
      lastNavigationKey.current = navigationKey;
      try {
        router.replace(`/trip/${passengerTripId}`);
      } catch (error) {
        setFailedNavigationKey(navigationKey);
        console.warn('Impossible d’ouvrir le trajet associé à la demande:', error);
      }
    }, Platform.OS === 'ios' ? 260 : 40);
    return () => clearTimeout(timer);
  }, [navigationKey, passengerTripId, router]);

  return {
    passengerTripId,
    isOpeningAssignedTrip: Boolean(navigationKey && navigationKey !== failedNavigationKey),
  };
}
