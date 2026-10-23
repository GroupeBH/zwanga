import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPaymentStateWriter, prunePaymentState } from '@/features/arrival-payment/paymentRetention';
import { getStorageKey } from '@/features/arrival-payment/paymentModel';
import type { StoredBookingPaymentState, StoredPaymentState } from '@/features/arrival-payment/paymentTypes';
import { PAYMENT_STORAGE_ERROR, serializePaymentStorage } from '@/features/arrival-payment/paymentStorage';

/** Mounted per account. Writes are ordered and never run inside React state updaters. */
export function usePaymentPersistence(userId: string | undefined, authenticated: boolean) {
  const [storedState, setStoredState] = useState<StoredPaymentState>({});
  const [isStoredStateLoaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [isStorageLoading, setStorageLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const hydrated = useRef(false);
  const current = useRef<StoredPaymentState>({});
  const alive = useRef(true);
  const owner = useRef(userId);
  owner.current = userId;
  const writeState = useMemo(() => createPaymentStateWriter(state => userId
    ? serializePaymentStorage(getStorageKey(userId), () => AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(state))) : Promise.resolve(), ok => {
      if (alive.current && owner.current === userId) setStorageError(ok ? '' : PAYMENT_STORAGE_ERROR);
    }), [userId]);
  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const isSessionCurrent = useCallback(() => alive.current && owner.current === userId, [userId]);
  useEffect(() => {
    setLoaded(false);
    setStorageError('');
    hydrated.current = false;
    current.current = {};
    setStoredState({});
  }, [authenticated, userId]);
  useEffect(() => {
    let cancelled = false;
    if (!authenticated || !userId) { setLoaded(true); return; }
    setStorageLoading(true);
    if (hydrated.current) {
      void writeState(current.current).finally(() => { if (!cancelled) setStorageLoading(false); });
      return () => { cancelled = true; };
    }
    void serializePaymentStorage(getStorageKey(userId), () => AsyncStorage.getItem(getStorageKey(userId))).then(raw => {
      if (cancelled) return;
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(PAYMENT_STORAGE_ERROR);
      current.current = prunePaymentState(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
      setStoredState(current.current);
      hydrated.current = true;
      setStorageError('');
      if (raw && Object.keys(parsed ?? {}).length !== Object.keys(current.current).length) writeState(current.current);
    }).catch(() => {
      if (!cancelled) setStorageError(PAYMENT_STORAGE_ERROR);
    }).finally(() => { if (!cancelled) { setLoaded(true); setStorageLoading(false); } });
    return () => { cancelled = true; };
  }, [authenticated, userId, writeState, retry]);

  const persistBookingState = useCallback((bookingId: string,
    patch: Partial<Record<keyof StoredBookingPaymentState, string | null>>) => {
    if (!userId || !hydrated.current) return Promise.resolve(false);
    const booking = { ...current.current[bookingId] };
    for (const [key, value] of Object.entries(patch)) {
      if (value) (booking as Record<string, string>)[key] = value;
      else delete booking[key as keyof StoredBookingPaymentState];
    }
    current.current = prunePaymentState({ ...current.current, [bookingId]: booking });
    if (alive.current && owner.current === userId) setStoredState(current.current);
    // Late financial responses still save their reference for the ORIGINAL account.
    return writeState(current.current);
  }, [userId, writeState]);
  const retryPaymentStorage = useCallback(() => setRetry(value => value + 1), []);
  return { storedState, isStoredStateLoaded, persistBookingState, isSessionCurrent,
    storageError, isStorageLoading, retryPaymentStorage };
}
