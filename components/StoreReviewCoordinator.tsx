import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Keyboard, Platform } from 'react-native';
import { useStore } from 'react-redux';
import { RideOverlayContext } from '@/features/navigation/rideOverlayContext';
import { passengerReviewCompletion, type ReviewCompletion } from '@/features/store-review/reviewEligibility';
import { createReviewRepository } from '@/features/store-review/reviewRepository';
import { loadNativeReview } from '@/features/store-review/nativeReview';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import type { RootState } from '@/store';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { accountActivityApi } from '@/store/api/accountActivityApi';
import { bookingApi } from '@/store/api/bookingApi';
import { tripApi } from '@/store/api/tripApi';

const repository = createReviewRepository(AsyncStorage);
const noSubscribe = () => () => {};
const unavailable = () => true;
const QUIET_TIME_MS = 3000;

export function StoreReviewCoordinator() {
  const authenticated = useAppSelector(selectIsAuthenticated);
  const userId = useAppSelector(state => state.auth.user?.id);
  return authenticated && userId && Platform.OS !== 'web' ? <ReviewSession key={userId} userId={userId} /> : null;
}

function ReviewSession({ userId }: { userId: string }) {
  const initializedAt = useRef(Date.now()).current;
  const store = useStore<RootState>();
  const overlay = useContext(RideOverlayContext);
  const overlayBusy = useSyncExternalStore(overlay?.subscribe ?? noSubscribe, overlay?.isBusy ?? unavailable, unavailable);
  const foreground = useAppIsActive();
  const resumedAt = useRef(Date.now());
  const wasForeground = useRef(foreground);
  if (foreground && !wasForeground.current) resumedAt.current = Date.now();
  wasForeground.current = foreground;
  const pathname = usePathname();
  const [due, setDue] = useState(false);
  // Cache reads only: the existing activity coordinator owns all network requests.
  const { data: bookings, isFetching: bookingsFetching } = bookingApi.endpoints.getMyActivityBookings.useQueryState(undefined, {
    selectFromResult: ({ data, isFetching }) => ({ data, isFetching }),
  });
  const { data: trips, isFetching: tripsFetching } = tripApi.endpoints.getMyActivityTrips.useQueryState(undefined, {
    selectFromResult: ({ data, isFetching }) => ({ data, isFetching }),
  });
  const { data: activity, fulfilledTimeStamp, isFetching: activityFetching, isError: activityError } = accountActivityApi.endpoints.getAccountActivity.useQueryState(userId, {
    selectFromResult: ({ data, fulfilledTimeStamp, isFetching, isError }) => ({ data, fulfilledTimeStamp, isFetching, isError }),
  });
  const completions = useMemo(() => {
    const results: ReviewCompletion[] = [];
    for (const booking of bookings ?? []) {
      const completion = passengerReviewCompletion(booking, userId);
      if (completion) results.push(completion);
    }
    for (const trip of trips ?? []) {
      if (trip.driverId === userId && trip.reviewCompletion) results.push(trip.reviewCompletion);
    }
    return results;
  }, [bookings, trips, userId]);
  const live = activity?.hasLiveActivity || trips?.some(trip => trip.driverId === userId && trip.status === 'ongoing')
    || bookings?.some(booking => booking.passengerId === userId && booking.status === 'accepted' && booking.trip?.status === 'ongoing');
  // A cached "no active ride" from before sleep is insufficient for another native window.
  const fresh = activity?.userId === userId && (fulfilledTimeStamp ?? 0) >= resumedAt.current && !activityFetching && !activityError;
  const safe = foreground && fresh && pathname === '/' && !overlayBusy && !live && !bookingsFetching && !tripsFetching;
  const safeRef = useRef(safe);
  safeRef.current = safe;

  useEffect(() => {
    let current = true;
    void repository.observe(userId, initializedAt, completions).then(value => {
      if (current) setDue(value);
    }).catch(() => { if (current) setDue(false); });
    return () => { current = false; };
  }, [completions, foreground, initializedAt, userId]);

  useEffect(() => {
    if (!due || !safe) return;
    let current = true;
    const isSafe = () => current && safeRef.current && AppState.currentState === 'active'
      && !Keyboard.isVisible() && Boolean(overlay && !overlay.isBusy())
      && store.getState().auth.isAuthenticated && store.getState().auth.user?.id === userId;
    const timer = setTimeout(() => {
      void repository.requestIfDue(userId, initializedAt, loadNativeReview, isSafe)
        .then(attempted => { if (current && attempted) setDue(false); })
        .catch(() => { if (current) setDue(false); });
    }, QUIET_TIME_MS);
    return () => { current = false; clearTimeout(timer); };
  }, [due, initializedAt, overlay, safe, store, userId]);
  return null;
}
