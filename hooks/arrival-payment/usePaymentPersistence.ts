import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPaymentStateWriter, prunePaymentState } from '@/features/arrival-payment/paymentRetention';
import { getStorageKey } from '@/features/arrival-payment/paymentModel';
import type { StoredBookingPaymentState, StoredPaymentState } from '@/features/arrival-payment/paymentTypes';

/** Mounted per account. Writes are ordered and never run inside React state updaters. */
export function usePaymentPersistence(userId: string | undefined, authenticated: boolean) {
  const [storedState, setStoredState] = useState<StoredPaymentState>({});
  const [isStoredStateLoaded, setLoaded] = useState(false);
  const current = useRef<StoredPaymentState>({});
  const writeState = useMemo(() => createPaymentStateWriter(state => userId
    ? AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(state)) : Promise.resolve()), [userId]);
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
      current.current = prunePaymentState(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
      setStoredState(current.current);
      if (raw && Object.keys(parsed ?? {}).length !== Object.keys(current.current).length) writeState(current.current);
    }).catch(() => {
      // A corrupt local cache must not prevent a server-side payment check.
    }).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [authenticated, userId, writeState]);

  const persistBookingState = useCallback((bookingId: string,
    patch: Partial<Record<keyof StoredBookingPaymentState, string | null>>) => {
    if (!userId) return;
    const booking = { ...current.current[bookingId] };
    for (const [key, value] of Object.entries(patch)) {
      if (value) (booking as Record<string, string>)[key] = value;
      else delete booking[key as keyof StoredBookingPaymentState];
    }
    current.current = prunePaymentState({ ...current.current, [bookingId]: booking });
    if (alive.current) setStoredState(current.current);
    // Late financial responses still save their reference for the ORIGINAL account.
    writeState(current.current);
  }, [userId, writeState]);
  return { storedState, isStoredStateLoaded, persistBookingState, isSessionCurrent };
}
