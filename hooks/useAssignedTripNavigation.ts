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

  useEffect(() => {
    if (!navigationKey || navigationKey === lastNavigationKey.current) return;
    let recovery: ReturnType<typeof setTimeout> | undefined;
    // The screen renders its loading state first, releasing any expanded native map on iOS.
    const timer = setTimeout(() => {
      lastNavigationKey.current = navigationKey;
      try {
        router.replace(destination!);
        // If the navigator ignores the transition, restore the existing trip/Home actions.
        recovery = setTimeout(() => setFailedNavigationKey(navigationKey), 2000);
      } catch (error) {
        setFailedNavigationKey(navigationKey);
        console.warn('Impossible d’ouvrir le trajet associé à la demande:', error);
      }
    }, Platform.OS === 'ios' ? 260 : 40);
    return () => { clearTimeout(timer); if (recovery) clearTimeout(recovery); };
  }, [navigationKey, destination, router]);

  return {
    passengerTripId,
    isOpeningAssignedTrip: Boolean(navigationKey && navigationKey !== failedNavigationKey),
  };
}
