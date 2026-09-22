import { useEffect, useMemo, useRef, useState } from 'react';
import type { Booking } from '@/types';
import type { StoredPaymentState } from '@/features/arrival-payment/paymentTypes';
import { hasNearbyStoredPosition, isNearPaymentDestination, isOnboardDigitalBooking } from '@/features/arrival-payment/nearArrivalPolicy';
import { useGetBookingByIdQuery } from '@/store/api/bookingApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import { trackingSocket } from '@/services/trackingSocket';
import { useDriverLocationFallback } from '@/hooks/passenger-navigation/useDriverLocationFallback';
import { normalizeAmount } from '@/features/arrival-payment/paymentModel';
import { useSyncArrivedPaymentBooking } from './useSyncArrivedPaymentBooking';

/** Uses the shared tracking socket / RTK cache: never starts another GPS watcher. */
export function useNearArrivalPayment(bookings: Booking[], passengerId: string | undefined, enabled: boolean, storedState: StoredPaymentState) {
  const [nearKey, setNearKey] = useState<string | null>(null);
  const candidate = useMemo(() => bookings.filter(booking =>
    booking.passengerId === passengerId && booking.status === 'accepted' &&
    ['electronic', 'points'].includes(booking.paymentMode ?? '') &&
    !booking.droppedOff && !booking.droppedOffConfirmedByPassenger &&
    !storedState[booking.id]?.acknowledgedAt && !storedState[booking.id]?.preArrivalDismissedAt &&
    (booking.paymentStatus !== 'succeeded' || nearKey === `${passengerId}:${booking.id}`) &&
    !['completed', 'cancelled'].includes(booking.trip?.status ?? '') &&
    (booking.trip?.status === 'ongoing' || booking.pickedUp ||
      Math.abs(Date.parse(booking.trip?.departureTime ?? '') - Date.now()) <= 2 * 60 * 60_000),
  ).sort((a, b) => Number(b.trip?.status === 'ongoing') - Number(a.trip?.status === 'ongoing') ||
    Number(Boolean(b.pickedUp)) - Number(Boolean(a.pickedUp)))[0] ?? null, [bookings, passengerId, storedState, nearKey]);

  const { currentData: liveBooking, refetch } = useGetBookingByIdQuery(candidate?.id ?? '', { skip: !enabled || !candidate });
  useSyncArrivedPaymentBooking(liveBooking, enabled);
  const { currentData: trip } = useGetTripByIdQuery(candidate?.tripId ?? '', { skip: !enabled || !candidate });
  const booking = useMemo(() => candidate ? {
    ...candidate, ...(liveBooking?.id === candidate.id ? liveBooking : {}),
    trip: trip ?? liveBooking?.trip ?? candidate.trip,
  } : null, [candidate, liveBooking, trip]);
  const bookingRef = useRef(booking);
  bookingRef.current = booking;
  const trackingEnabled = enabled && Boolean(booking && booking.trip?.status === 'ongoing');
  const tripId = candidate?.tripId ?? '';
  const candidateId = candidate?.id;
  const snapshot = useDriverLocationFallback(tripId, trackingEnabled);

  useEffect(() => {
    setNearKey(null);
  }, [passengerId]);

  useEffect(() => {
    if (!trackingEnabled || !passengerId || !candidateId) return;
    let cancelled = false;
    const stopLocations = trackingSocket.subscribeToDriverLocation(payload => {
      const current = bookingRef.current;
      if (cancelled || !current || payload.tripId !== current.tripId || !payload.coordinates ||
          !isOnboardDigitalBooking(current, passengerId) || current.paymentStatus === 'succeeded' ||
          !(Number(current.paymentAmount) > 0)) return;
      if (isNearPaymentDestination(current, { latitude: payload.coordinates[1], longitude: payload.coordinates[0] }, payload.updatedAt)) {
        setNearKey(`${passengerId}:${current.id}`);
      }
    });
    const stopProgress = trackingSocket.subscribeToBookingAutoProgress(payload => {
      if (!cancelled && payload.tripId === tripId && payload.events.some(event => event.bookingId === candidateId)) void refetch();
    });
    void trackingSocket.joinTrip(tripId).catch(() => undefined);
    return () => { cancelled = true; stopLocations(); stopProgress(); trackingSocket.leaveTrip(tripId); };
  }, [candidateId, passengerId, refetch, trackingEnabled, tripId]);

  useEffect(() => {
    if (!enabled || !booking || !passengerId || !isOnboardDigitalBooking(booking, passengerId) ||
        booking.paymentStatus === 'succeeded' || !(Number(booking.paymentAmount) > 0)) return;
    const coordinate = snapshot?.coordinates ? { latitude: snapshot.coordinates[1], longitude: snapshot.coordinates[0] } : null;
    if (hasNearbyStoredPosition(booking) || isNearPaymentDestination(booking, coordinate, snapshot?.updatedAt)) {
      setNearKey(`${passengerId}:${booking.id}`);
    }
  }, [booking, enabled, passengerId, snapshot]);

  if (!enabled || !booking || !passengerId || !isOnboardDigitalBooking(booking, passengerId)) return null;
  const stored = storedState[booking.id];
  if (stored?.acknowledgedAt || stored?.preArrivalDismissedAt || normalizeAmount(booking.paymentAmount) === 0) return null;
  // Keep an opened/payment-in-progress sheet stable despite GPS jitter or an app restart.
  return nearKey === `${passengerId}:${booking.id}` || stored?.requiredActionAt ? booking : null;
}
