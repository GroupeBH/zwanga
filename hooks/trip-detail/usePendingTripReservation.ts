import { useEffect, useRef, useState } from 'react';
import type { useDriverTripWorkspace } from './useDriverTripWorkspace';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { hasPassengerFinishedRide } from '@/features/activity/tripParticipation';
import type { Booking } from '@/types';

// A revised price must be presented again; an identical REST refresh must not.
const reservationKey = (booking: Booking) => `${booking.id}:${booking.proposedPricePerSeat ?? ''}:${booking.numberOfSeats}`;
type Workspace = ReturnType<typeof useDriverTripWorkspace>;

/** Uses the authenticated detail query and its existing socket/REST updates.
 * No extra request, timer, ringtone or native modal is introduced here. */
export function usePendingTripReservation(workspace: Workspace, enabled: boolean) {
  const { state } = workspace;
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [answering, setAnswering] = useState<string | null>(null);
  const [attempted, setAttempted] = useState<string | null>(null);
  const mounted = useRef(true), lock = useRef(false);
  const shownBookingId = useRef<string | null>(null);
  const session = useRef(getTokenSessionVersion());
  const latest = useRef({ workspace, enabled }); latest.current = { workspace, enabled };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && session.current === getTokenSessionVersion() &&
    latest.current.workspace.state.userId === state.userId && latest.current.workspace.state.trip?.id === state.trip?.id &&
    latest.current.workspace.state.isOwner && latest.current.workspace.state.isScreenActive && latest.current.enabled &&
    !latest.current.workspace.state.trip?.isExpired &&
    ['upcoming', 'ongoing'].includes(latest.current.workspace.state.trip?.status ?? '');
  const eligible = enabled && state.isOwner && state.isScreenActive && !state.trip?.isExpired &&
    (state.trip?.status === 'upcoming' || state.trip?.status === 'ongoing') &&
    !state.bookingsError && !state.bookingsOffline && session.current === getTokenSessionVersion();
  const candidates = eligible ? (state.bookings ?? []).filter(booking => booking.tripId === state.trip?.id &&
    booking.passengerId !== state.userId && booking.status === 'pending' && !hasPassengerFinishedRide(booking) &&
    !dismissed.has(reservationKey(booking))).sort((a, b) =>
    Number(b.id === state.focusBookingId) - Number(a.id === state.focusBookingId) || a.id.localeCompare(b.id)) : [];
  const booking = candidates.find(item => item.id === (answering ?? shownBookingId.current)) ?? candidates[0];
  const key = booking ? reservationKey(booking) : null;
  const busy = Boolean(answering || workspace.busy || state.processingBookingId);
  const visible = Boolean(booking && (!workspace.busy || answering === booking.id || state.processingBookingId === booking.id));
  useEffect(() => { if (visible && booking) shownBookingId.current = booking.id; }, [visible, booking]);
  const dismissKey = (value: string) => setDismissed(previous => new Set([...previous, value]));
  const dismiss = () => { if (key && !busy && !lock.current && current()) dismissKey(key); };
  const answer = async (accept: boolean) => {
    if (!booking || !key || lock.current || busy || !workspace.ready || !current() || !latest.current.workspace.ready) return;
    const actual = latest.current.workspace.state.bookings?.find(item => item.id === booking.id);
    if (!actual || actual.tripId !== state.trip?.id || actual.passengerId === state.userId ||
      hasPassengerFinishedRide(actual) || actual.status !== 'pending' || reservationKey(actual) !== key) return;
    lock.current = true; setAnswering(booking.id); setAttempted(key); workspace.dismissFeedback();
    try {
      const confirmed = accept ? await workspace.bookingsActions.handleAcceptBooking(booking.id)
        : await workspace.bookingsActions.handleRejectBooking(booking);
      if (confirmed && current()) dismissKey(key);
    } catch {
      if (current()) workspace.bookingsActions.showFeedback('error', 'Impossible de répondre. Réessayez.');
    } finally {
      lock.current = false;
      if (mounted.current) setAnswering(null);
    }
  };
  return { booking, visible, busy, disabled: busy || !workspace.ready, dismiss, answer,
    error: attempted === key && workspace.feedback?.type === 'error' ? workspace.feedback.message : null };
}
