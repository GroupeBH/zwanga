import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { tripApi } from '@/store/api/tripApi';
import { useAppDispatch } from '@/store/hooks';
import type { Trip } from '@/types';
import type { Router } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';

/** Open guidance only after server confirmation and native modal dismissal. */
export function useTripStartTransition(screenKey: string | undefined, router: Router, modalVisible = false) {
  const active = useScreenIsActive();
  const dispatch = useAppDispatch();
  const session = useMemo(() => ({
    screenKey, mounted: true, active: true, busy: false, navigated: false,
    modalPresented: false, pendingTrip: null as Trip | null,
  }), [screenKey]);
  session.active = active;
  if (modalVisible) session.modalPresented = true;
  if (!active) session.pendingTrip = null;

  useEffect(() => {
    session.mounted = true;
    return () => { session.mounted = false; session.pendingTrip = null; };
  }, [session]);

  const isCurrent = useCallback(() => session.mounted && session.active && !session.navigated, [session]);
  const begin = useCallback(() => {
    if (!isCurrent() || session.busy || session.pendingTrip) return false;
    session.busy = true;
    return true;
  }, [isCurrent, session]);
  const finish = useCallback(() => { session.busy = false; }, [session]);
  const flush = useCallback(() => {
    const trip = session.pendingTrip;
    if (!isCurrent() || !trip || session.modalPresented) return;
    // Reuse the confirmed server response: no extra HTTP request or invented status.
    dispatch(tripApi.util.upsertQueryEntries([{ endpointName: 'getTripById', arg: trip.id, value: trip }]));
    session.pendingTrip = null;
    session.navigated = true;
    router.replace(`/trip/navigate/${trip.id}`);
  }, [dispatch, isCurrent, router, session]);
  const openNavigation = useCallback((trip: Trip) => {
    if (!isCurrent()) return;
    session.pendingTrip = trip;
    flush();
  }, [flush, isCurrent, session]);
  const onModalDismiss = useCallback(() => {
    if (modalVisible) return;
    session.modalPresented = false;
    flush();
  }, [flush, modalVisible, session]);

  useEffect(() => {
    // Android does not emit onDismiss; iOS must finish dismissing its native modal.
    if (!modalVisible && Platform.OS !== 'ios') onModalDismiss();
  }, [modalVisible, onModalDismiss]);

  return { begin, finish, isCurrent, openNavigation, onModalDismiss };
}
