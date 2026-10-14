import { useCallback, useEffect, useRef, useState } from 'react';
import type { Booking } from '@/types';
import type { RideOutboxEntry } from '@/features/ride-recovery/rideRecoveryModel';
import { rideOutbox } from '@/services/rideOutbox';
import { useGetBookingByIdQuery } from '@/store/api/bookingApi';
import { useSyncArrivedPaymentBooking } from './useSyncArrivedPaymentBooking';

export const ARRIVAL_CONFIRMATION_WINDOW_MS = 30_000;
export const ARRIVAL_CONFIRMATION_REFRESH_MS = 3_000;
export type ArrivalConfirmationProgress = { phase: 'idle' | 'syncing' | 'paused' | 'offline' | 'pickup_required';
  title: string; message: string; refreshing: boolean };
interface Options {
  booking: Booking | null; userId?: string; waiting: boolean; active: boolean; online: boolean;
  entries: readonly RideOutboxEntry[];
}

/** Only the visible, unconfirmed arrival gets a short, shared RTK read window.
 * Never computes a fare, creates another declaration or initiates a payment.
 */
export function useArrivalConfirmationSync({ booking, userId, waiting, active, online, entries }: Options) {
  const eligible = Boolean(waiting && booking && userId && booking.passengerId === userId);
  const enabled = eligible && active && online;
  const key = eligible ? `${userId}:${booking!.id}:${booking!.tripId}` : '';
  const [manualRequest, setManualRequest] = useState({ key: '', run: 0 });
  const run = manualRequest.key === key ? manualRequest.run : 0;
  const [window, setWindow] = useState({ key: '', run: -1, paused: false });
  const retrying = enabled && (!window.paused || window.key !== key || window.run !== run);
  const entry = entries.find(value => value.actorUserId === userId && value.bookingId === booking?.id &&
    value.tripId === booking?.tripId && value.stage === 'dropoff' && value.decision === 'confirm');
  const { currentData: freshBooking, refetch } = useGetBookingByIdQuery(booking?.id ?? '', {
    skip: !enabled,
    refetchOnMountOrArgChange: true,
    pollingInterval: retrying ? ARRIVAL_CONFIRMATION_REFRESH_MS : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: false,
    refetchOnReconnect: false,
  });
  useSyncArrivedPaymentBooking(freshBooking?.id === booking?.id && freshBooking?.tripId === booking?.tripId
    ? freshBooking : undefined, enabled);
  const latest = useRef({ key, enabled, refetch });
  latest.current = { key, enabled, refetch };
  const manualGuard = useRef(false);
  const retry = useCallback(() => {
    const current = latest.current;
    if (!current.enabled || current.key !== key || manualGuard.current) return;
    manualGuard.current = true;
    setManualRequest(value => ({ key, run: value.key === key ? value.run + 1 : 1 }));
  }, [key]);
  useEffect(() => {
    manualGuard.current = enabled;
    if (!enabled || !booking) return;
    let cancelled = false;
    setWindow({ key, run, paused: false });
    // Same immutable event IDs and serialized worker; no second concurrent write.
    void rideOutbox.retry(booking.id).catch(() => undefined);
    if (run > 0) void Promise.resolve().then(() => {
      if (!cancelled && latest.current.enabled && latest.current.key === key) return latest.current.refetch();
    }).catch(() => undefined);
    const timer = setTimeout(() => {
      if (!cancelled) { manualGuard.current = false; setWindow({ key, run, paused: true }); }
    }, ARRIVAL_CONFIRMATION_WINDOW_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, key, run, booking?.id]);
  useEffect(() => {
    let cancelled = false;
    if (enabled && entry?.state === 'confirmed') {
      // A later successful reconciliation can unlock the sheet even after its
      // short polling window expired. It does not start another polling loop.
      void Promise.resolve().then(() => {
        if (!cancelled && latest.current.enabled && latest.current.key === key) return latest.current.refetch();
      }).catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [enabled, key, entry?.state]);

  const paused = enabled && window.key === key && window.run === run && window.paused;
  const pickupRequired = entry?.message === 'En attente de la confirmation de l’embarquement.';
  const progress: ArrivalConfirmationProgress = !eligible ? { phase: 'idle', title: '', message: '', refreshing: false }
    : !online ? { phase: 'offline', title: 'Connexion indisponible',
      message: 'Votre arrivée est sauvegardée. Reconnectez-vous pour la confirmer et payer.', refreshing: false }
    : pickupRequired ? { phase: 'pickup_required', title: 'Embarquement à confirmer',
      message: 'Votre embarquement n’est pas encore confirmé sur le serveur. Le conducteur doit aussi le valider, ou la détection automatique le confirmer.', refreshing: !paused && enabled }
    : paused ? { phase: 'paused', title: 'Confirmation non reçue',
      message: 'Le serveur n’a pas encore confirmé votre arrivée. Réessayez ou fermez pour reprendre plus tard. Aucun paiement n’a été lancé.', refreshing: false }
    : { phase: 'syncing', title: 'Confirmation de l’arrivée…',
      message: 'Votre arrivée est sauvegardée. Le paiement sera disponible dès la confirmation du serveur, sans attendre le conducteur.', refreshing: enabled };
  return { progress, retry };
}
