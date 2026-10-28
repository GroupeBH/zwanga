import type { Router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Booking, Trip, TripRequest } from '@/types';
import { assignedPassengerNavigation } from '@/features/request-detail/requestSearchModel';
import {
  canUseCachedRequestLink,
  getAssignedPassengerTripId,
  hasAssignedTripStarted,
} from '@/features/trip-request/assignedTripNavigation';

type Props = {
  requestId: string | undefined;
  tripRequest: TripRequest | undefined;
  assignedTrip: Trip | undefined;
  bookings?: Booking[];
  bookingError?: unknown;
  isResolvingBooking?: boolean;
  userId: string | undefined;
  requestError?: unknown;
  tripError?: unknown;
  isScreenActive: boolean;
  router: Router;
};

/** No extra request or polling: follow the existing RTK Query subscriptions. */
export function useAssignedTripNavigation({
  requestId, tripRequest, assignedTrip, bookings, bookingError, isResolvingBooking, userId, requestError, tripError, isScreenActive, router,
}: Props) {
  const passengerTripId = getAssignedPassengerTripId(requestId, tripRequest, userId, requestError);
  const passengerNavigation = passengerTripId && canUseCachedRequestLink(bookingError)
    ? assignedPassengerNavigation(tripRequest, assignedTrip, bookings, userId) : null;
  const destination = passengerNavigation ?? (!isResolvingBooking && hasAssignedTripStarted(passengerTripId, assignedTrip) ? `/trip/${passengerTripId}` as const : null);
  const shouldOpenTrip = isScreenActive && canUseCachedRequestLink(tripError) && !!destination;
  const navigationKey = shouldOpenTrip ? `${userId}:${requestId}:${destination}` : null;
  const lastNavigationKey = useRef<string | null>(null);
  const [failedNavigationKey, setFailedNavigationKey] = useState<string | null>(null);
  const currentRouter = useRef(router); currentRouter.current = router;

  useEffect(() => {
    if (!navigationKey || navigationKey === failedNavigationKey) return;
    let recovery: ReturnType<typeof setTimeout> | undefined;
    // A blur cancels timers, not the attempted transition. On return, restore
    // its fallback without navigating twice or leaving the loader stuck.
    if (navigationKey === lastNavigationKey.current) {
      recovery = setTimeout(() => setFailedNavigationKey(navigationKey), 2000);
      return () => clearTimeout(recovery);
    }
    // The screen renders its loading state first, releasing any expanded native map on iOS.
    const timer = setTimeout(() => {
      lastNavigationKey.current = navigationKey;
      try {
        currentRouter.current.replace(destination!);
        // If the navigator ignores the transition, restore the existing trip/Home actions.
        recovery = setTimeout(() => setFailedNavigationKey(navigationKey), 2000);
      } catch (error) {
        setFailedNavigationKey(navigationKey);
        console.warn('Impossible d’ouvrir le trajet associé à la demande:', error);
      }
    }, Platform.OS === 'ios' ? 260 : 40);
    return () => { clearTimeout(timer); if (recovery) clearTimeout(recovery); };
  }, [navigationKey, destination, failedNavigationKey]);

  return {
    passengerTripId,
    isOpeningAssignedTrip: Boolean(navigationKey && navigationKey !== failedNavigationKey),
  };
}
