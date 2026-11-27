import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useGetBookingByIdQuery, useGetMyActivityBookingsQuery } from '@/store/api/bookingApi';
import { baseApi } from '@/store/api/baseApi';
import { applyPassengerProgress } from '@/store/api/booking/passengerProgressCache';
import { sharedBookingsOptions } from '@/features/activity/activityQueryOptions';
import { displayReadOptions } from '@/hooks/useDisplayReads';
import { createPassengerProgressTracker, isPassengerRideMonitored, passengerRideStage,
  type PassengerRideNotice } from '@/features/passenger-navigation/passengerRideProgress';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { trackingSocket } from '@/services/trackingSocket';
import type { Booking } from '@/types';

const EMPTY: Booking[] = [];

/** Mounted once per authenticated session. One active-booking GET, shared with navigation.
 * Manual declarations do not always emit GPS progress; the bounded REST poll is essential.
 */
export function usePassengerRideProgress(userId: string) {
  const active = useAppIsActive();
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const dispatch = useAppDispatch();
  const session = getTokenSessionVersion();
  const tracker = useRef(createPassengerProgressTracker(userId));
  const blocked = useRef(new Set<string>());
  const pinned = useRef<Booking | null>(null);
  const [notice, setNotice] = useState<PassengerRideNotice | null>(null);
  const [, rerender] = useState(0);
  const { data: bookings = EMPTY } = useGetMyActivityBookingsQuery(undefined, sharedBookingsOptions);
  const candidates = bookings.filter(booking => !blocked.current.has(booking.id) && isPassengerRideMonitored(booking, userId))
    .sort((a, b) => Number(b.trip?.status === 'ongoing') - Number(a.trip?.status === 'ongoing') || a.createdAt.localeCompare(b.createdAt));
  // A list may omit a just-completed ride before its final detail arrives. Finish that read first.
  const candidate = candidates.find(booking => booking.id === pinned.current?.id) ??
    (pinned.current && !blocked.current.has(pinned.current.id) ? pinned.current : candidates[0]);
  pinned.current = candidate ?? null;
  const bookingId = candidate?.id ?? '';
  const tripId = candidate?.tripId ?? '';
  const trackable = candidate?.trip?.status === 'ongoing';
  const enabled = active && online && !!bookingId;
  const read = useGetBookingByIdQuery(bookingId, { ...displayReadOptions(enabled, 10_000), refetchOnMountOrArgChange: true });

  const observe = useCallback((booking: Booking) => {
    if (session !== getTokenSessionVersion() || blocked.current.has(booking.id)) return;
    const next = tracker.current.observe(booking);
    if (!next) return;
    setNotice(next);
    dispatch(applyPassengerProgress(booking, userId));
    // Also refresh trip status/declarations; never invalidate this GET into a loop.
    dispatch(baseApi.util.invalidateTags([{ type: 'Trip', id: booking.tripId }, 'AccountActivity', 'MyTripRequests',
      ...(booking.trip?.tripRequestId ? [{ type: 'TripRequest' as const, id: booking.trip.tripRequestId }] : [])]));
  }, [dispatch, session, userId]);

  useEffect(() => {
    if (!active || !online) return;
    bookings.forEach(observe);
  }, [active, bookings, observe, online]);

  useEffect(() => {
    if (!enabled || session !== getTokenSessionVersion()) return;
    const status = Number((read.error as { status?: unknown } | undefined)?.status);
    if ([401, 403, 404, 410].includes(status)) {
      blocked.current.add(bookingId);
      setNotice(current => current?.bookingId === bookingId ? null : current);
      rerender(value => value + 1);
      return;
    }
    const booking = read.currentData;
    if (read.isError || !booking || booking.id !== bookingId || booking.tripId !== tripId || booking.passengerId !== userId) return;
    observe(booking);
    dispatch(applyPassengerProgress(booking, userId));
    if (booking.status !== 'accepted' || passengerRideStage(booking) === 'dropoff' ||
        booking.trip?.status === 'cancelled' || booking.trip?.status === 'completed') {
      blocked.current.add(bookingId);
      if (booking.trip?.status === 'cancelled' || ['cancelled', 'rejected'].includes(booking.status))
        setNotice(current => current?.bookingId === bookingId ? null : current);
      rerender(value => value + 1);
    }
  }, [bookingId, dispatch, enabled, observe, read.currentData, read.error, read.isError, session, tripId, userId]);

  useEffect(() => {
    if (!enabled || !tripId || !trackable) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => !disposed && session === getTokenSessionVersion();
    const refresh = () => {
      if (!current() || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (current()) dispatch(baseApi.util.invalidateTags([{ type: 'Booking', id: bookingId }, { type: 'Trip', id: tripId }]));
      }, 350);
    };
    void trackingSocket.joinTrip(tripId).catch(() => { /* REST remains available. */ });
    const stop = trackingSocket.subscribeToBookingAutoProgress(payload => {
      if (payload?.tripId === tripId && Array.isArray(payload.events) && payload.events.some(event => event?.bookingId === bookingId)) refresh();
    });
    const stopConnection = trackingSocket.subscribeToConnectionState(connected => { if (connected) refresh(); });
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      stop(); stopConnection();
      void trackingSocket.leaveTrip(tripId);
    };
  }, [bookingId, dispatch, enabled, session, trackable, tripId]);

  return { notice, visible: active && !!notice, close: () => setNotice(null) };
}
