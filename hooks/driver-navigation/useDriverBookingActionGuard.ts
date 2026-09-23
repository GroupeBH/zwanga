import type { Booking } from '@/types';
import { canRespondToPassengerInterruption } from '@/features/driver-navigation/passengerInterruptionResponse';
import { hasBookingDropoffCompleted, hasBookingPickupCompleted } from '@/features/driver-navigation/navigationBooking';
import { useCallback, useEffect, useMemo, useRef } from 'react';

type Operation = 'accept' | 'reject' | 'interrupt-confirm' | 'interrupt-reject' | 'pickup-confirm' | 'pickup-cancel';
interface Params {
  tripId: string; active: boolean; bookings?: Booking[];
  setProcessingBookingId: (id: string | null) => void;
}

/** Shared by all passenger actions on this driver screen; never a financial lock. */
export function useDriverBookingActionGuard(params: Params) {
  const latest = useRef(params);
  latest.current = params;
  const scope = useMemo(() => ({ tripId: params.tripId, active: params.active }), [params.tripId, params.active]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const mounted = useRef(true);
  const busy = useRef<object | null>(null);
  const completed = useMemo(() => ({ tripId: params.tripId, keys: new Set<string>() }), [params.tripId]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { setProcessingBookingId } = params;
  useEffect(() => { setProcessingBookingId(null); }, [scope, setProcessingBookingId]);
  return useCallback((booking: Booking, operation: Operation) => {
    const p = latest.current;
    const key = `${booking.id}:${operation}:${booking.interruptionRequest?.id ?? ''}`;
    if (completed.keys.has(key)) return null;
    if (!mounted.current || !p.active || busy.current || booking.tripId !== p.tripId) return null;
    const fresh = p.bookings?.find(item => item.id === booking.id && item.tripId === p.tripId);
    if (!fresh) return null;
    if (operation === 'accept' || operation === 'reject') {
      if (fresh.status !== 'pending') return null;
    } else {
      if (fresh.status !== 'accepted' || hasBookingDropoffCompleted(fresh)) return null;
      if (operation.startsWith('pickup-') && hasBookingPickupCompleted(fresh)) return null;
      if (operation.startsWith('interrupt-') && (!canRespondToPassengerInterruption(fresh) ||
        fresh.interruptionRequest?.id !== booking.interruptionRequest?.id)) return null;
    }
    const token = {};
    const startedScope = currentScope.current;
    busy.current = token;
    p.setProcessingBookingId(fresh.id);
    const isCurrent = () => mounted.current && currentScope.current === startedScope && latest.current.active;
    return { booking: fresh, isCurrent, complete() { completed.keys.add(key); }, finish() {
      if (busy.current !== token) return;
      busy.current = null;
      if (isCurrent()) latest.current.setProcessingBookingId(null);
    } };
  }, [completed]);
}
