import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getStorageKey } from '@/features/arrival-payment/paymentModel';
import type { StoredBookingPaymentState, StoredPaymentState } from '@/features/arrival-payment/paymentTypes';

/** Mounted per account. Writes are ordered and never run inside React state updaters. */
export function usePaymentPersistence(userId: string | undefined, authenticated: boolean) {
  const [storedState, setStoredState] = useState<StoredPaymentState>({});
  const [isStoredStateLoaded, setLoaded] = useState(false);
  const current = useRef<StoredPaymentState>({});
  const writes = useRef(Promise.resolve());
  const alive = useRef(true);
  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const isSessionCurrent = useCallback(() => alive.current, []);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    current.current = {};
    setStoredState({});
    if (!authenticated || !userId) { setLoaded(true); return; }
    void AsyncStorage.getItem(getStorageKey(userId)).then(raw => {
      if (cancelled) return;
      const parsed = raw ? JSON.parse(raw) : {};
      current.current = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      setStoredState(current.current);
    }).catch(() => {
      // A corrupt local cache must not prevent a server-side payment check.
    }).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [authenticated, userId]);

  const persistBookingState = useCallback((bookingId: string,
    patch: Partial<Record<keyof StoredBookingPaymentState, string | null>>) => {
    if (!userId) return;
    const booking = { ...current.current[bookingId] };
    for (const [key, value] of Object.entries(patch)) {
      if (value) (booking as Record<string, string>)[key] = value;
      else delete booking[key as keyof StoredBookingPaymentState];
    }
    current.current = { ...current.current, [bookingId]: booking };
    if (alive.current) setStoredState(current.current);
    const serialized = JSON.stringify(current.current);
    // Late financial responses still save their reference for the ORIGINAL account.
    writes.current = writes.current.then(() => AsyncStorage.setItem(getStorageKey(userId), serialized))
      .catch(() => { console.warn('[ArrivalPayment] Sauvegarde locale du paiement indisponible.'); });
  }, [userId]);
  return { storedState, isStoredStateLoaded, persistBookingState, isSessionCurrent };
}
