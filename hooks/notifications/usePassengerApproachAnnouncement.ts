import { useEffect, useRef } from 'react';
import type { Booking, Trip } from '@/types';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useHasRideOverlay } from '@/features/navigation/RideOverlayProvider';
import { useDriverLocationFallback } from '@/hooks/passenger-navigation/useDriverLocationFallback';
import { APPROACH_FIX_MAX_AGE_MS, observePassengerApproach, passengerApproachContext, passengerApproachMessage,
  type ApproachFix } from '@/features/notifications/passengerApproach';
import { passengerApproachState } from '@/services/passengerApproachSession';
import { trackingSocket } from '@/services/trackingSocket';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { isAppActive } from '@/services/appActivity';
import { publishPaymentSpeech, removePaymentSpeech } from '@/services/paymentSpeechSource';

type Params = { userId?: string; trip?: Trip | null; booking?: Booking | null; isScreenActive: boolean;
  locationSnapshot?: ApproachFix & { tripId: string }; useFallback?: boolean; joinTracking?: boolean };

/** Screen-owned voice only. No new GPS acquisition, background speech or native player. */
export function usePassengerApproachAnnouncement({ userId, trip, booking, isScreenActive, locationSnapshot,
  useFallback = false, joinTracking = false }: Params) {
  const foreground = useAppIsActive();
  const blocked = useHasRideOverlay();
  const context = passengerApproachContext(userId, trip, booking);
  const enabled = Boolean(isScreenActive && foreground && context);
  const key = context?.key, tripId = context?.tripId;
  const version = getTokenSessionVersion();
  const fallback = useDriverLocationFallback(tripId ?? '', enabled && useFallback);
  const latest = useRef({ trip, blocked, key: enabled ? key : undefined });
  latest.current = { trip, blocked, key: enabled ? key : undefined };
  const controller = useRef<{ feed: (sample: ApproachFix) => void; refresh: () => void } | null>(null);

  useEffect(() => {
    if (!enabled || !context || !userId) return;
    const token = {}, state = passengerApproachState(context.key);
    let disposed = false, expiry: ReturnType<typeof setTimeout> | undefined;
    const current = () => !disposed && latest.current.key === context.key && version === getTokenSessionVersion() && isAppActive();
    const refresh = () => {
      clearTimeout(expiry); expiry = undefined;
      if (!current()) { removePaymentSpeech(token); return; }
      const message = latest.current.trip && !latest.current.blocked
        ? passengerApproachMessage(state, context.key, latest.current.trip, Date.now()) : null;
      if (message) publishPaymentSpeech(token, userId, version, message, 'approach');
      else removePaymentSpeech(token);
      const remaining = (state.fix?.time ?? 0) + APPROACH_FIX_MAX_AGE_MS + 1 - Date.now();
      if (remaining > 0) expiry = setTimeout(refresh, remaining);
    };
    const feed = (sample: ApproachFix) => {
      if (!current()) return;
      observePassengerApproach(state, context.pickup, sample, Date.now()); refresh();
    };
    controller.current = { feed, refresh };
    const unsubscribe = trackingSocket.subscribeToDriverLocation(payload => {
      if (payload.tripId === context.tripId) feed(payload);
    });
    const unsubscribeProgress = trackingSocket.subscribeToBookingAutoProgress(payload => {
      if (!current() || payload.tripId !== context.tripId) return;
      if (payload.events.some(event => event.bookingId === context.bookingId &&
        ['pickup_confirmed', 'dropoff_confirmed', 'passenger_no_show', 'passenger_boarding_uncertain'].includes(event.type))) {
        state.closed = true; refresh();
      }
    });
    if (joinTracking) void trackingSocket.joinTrip(context.tripId).then(() => {
      if (current()) return trackingSocket.requestDriverLocation(context.tripId);
    }).catch(() => { /* The bounded REST fallback remains available. */ });
    refresh();
    return () => {
      disposed = true; clearTimeout(expiry); controller.current = null;
      unsubscribe(); unsubscribeProgress(); removePaymentSpeech(token);
      if (joinTracking) void trackingSocket.leaveTrip(context.tripId).catch(() => {});
    };
    // The key includes account, booking, driver and pickup. GPS updates use feed,
    // never reconnect the socket or restart the shared utterance on every fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, version, joinTracking]);

  useEffect(() => { controller.current?.refresh(); }, [blocked, trip]);
  useEffect(() => {
    if (trip?.currentLocation?.coordinates) controller.current?.feed({ coordinates: trip.currentLocation.coordinates as [number, number], updatedAt: trip.lastLocationUpdateAt });
  }, [enabled, key, trip?.currentLocation, trip?.lastLocationUpdateAt]);
  useEffect(() => {
    const sample = locationSnapshot ?? fallback;
    if (sample && sample.tripId === tripId) controller.current?.feed(sample);
  }, [enabled, key, tripId, locationSnapshot, fallback]);
}
