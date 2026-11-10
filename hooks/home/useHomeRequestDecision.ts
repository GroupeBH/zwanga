import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Router } from 'expo-router';
import type { TripRequest } from '@/types';
import { homePriorityKeys } from '@/features/home/homePriorityDismissal';
import { isRequestUnassigned, isTripRequestWithinAcceptanceWindow } from '@/features/trip-request/requestExpiration';
import { acceptedRequestVehicleTypes } from '@/features/trip-request/vehicleSelection';
import { normalizeTripRequestVehicleType } from '@/features/request-detail/requestDetailModel';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useAppSelector } from '@/store/hooks';
import { useAcceptTripRequestMutation, useGetTripRequestByIdQuery } from '@/store/api/tripRequestApi';
import { useGetVehiclesQuery } from '@/store/api/vehicleApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getApiErrorMessage } from '@/utils/errorHelpers';

type Props = {
  request: TripRequest | null;
  userId?: string;
  enabled: boolean;
  dismissPriority: (key: string) => void;
  router: Router;
  onOpenRequestDetail?: (id: string) => void;
};

/** Shared Home/post-trip decision. No push listener, audio player, native modal or automatic mutation. */
export function useHomeRequestDecision({ request, userId, enabled, dismissPriority, router, onOpenRequestDetail }: Props) {
  const authenticatedUserId = useAppSelector(state => state.auth.user?.id);
  const version = getTokenSessionVersion();
  const session = useMemo(() => ({ userId, version, mounted: true, active: false, busy: false, leaving: false }), [userId, version]);
  session.active = enabled && Boolean(userId && userId === authenticatedUserId);
  useEffect(() => {
    session.mounted = true;
    return () => { session.mounted = false; };
  }, [session]);
  const [flight, setFlight] = useState<TripRequest | null>(null);
  const [closedKey, setClosedKey] = useState('');
  const [vehicleChoice, setVehicleChoice] = useState({ requestId: '', vehicleId: '' });
  const [failure, setFailure] = useState({ requestId: '', message: '' });
  const pendingRoute = useRef<string | null>(null);
  useEffect(() => {
    setFlight(null);
    setVehicleChoice({ requestId: '', vehicleId: '' });
    setFailure({ requestId: '', message: '' });
    pendingRoute.current = null;
  }, [session]);
  const candidate = flight ?? request;
  const key = candidate ? homePriorityKeys.nearbyRequest(candidate) : '';
  const visible = session.active && !session.leaving && Boolean(candidate && key !== closedKey);
  const readsEnabled = useDisplayReadsEnabled(visible);
  const detail = useGetTripRequestByIdQuery(candidate?.id ?? '', displayReadOptions(readsEnabled, 30_000));
  const vehiclesQuery = useGetVehiclesQuery(undefined, displayReadOptions(readsEnabled));
  const { isIdentityVerified } = useIdentityCheck();
  const [acceptRequest] = useAcceptTripRequestMutation();
  const live = detail.currentData?.id === candidate?.id ? detail.currentData : undefined;
  const order = live ?? candidate;
  const vehicles = (vehiclesQuery.currentData ?? []).filter(vehicle => vehicle.ownerId === userId && vehicle.isActive !== false &&
    acceptedRequestVehicleTypes(order ?? {}).includes(normalizeTripRequestVehicleType(vehicle.type)));
  const selectedVehicleId = vehicleChoice.requestId === order?.id ? vehicleChoice.vehicleId : '';
  const vehicle = vehicles.find(item => item.id === selectedVehicleId) ?? (vehicles.length === 1 ? vehicles[0] : null);
  const available = Boolean(live && live.passengerId !== userId && isRequestUnassigned(live) &&
    isTripRequestWithinAcceptanceWindow(live) && !live.offers?.some(offer => offer.driverId === userId && offer.status === 'pending'));
  const loading = !live || detail.isFetching || vehiclesQuery.isFetching;
  const readError = detail.isError || vehiclesQuery.isError;
  const canAccept = readsEnabled && available && Number.isFinite(Date.parse(live?.departureDateMin ?? '')) &&
    isIdentityVerified && Boolean(vehicle) && !loading && !readError && !flight;
  const current = () => session.mounted && getTokenSessionVersion() === version;
  const interactive = () => current() && session.active && AppState.currentState === 'active' && !session.leaving;
  const latest = useRef({ canAccept, requestId: order?.id });
  latest.current = { canAccept, requestId: order?.id };

  const close = () => {
    if (!interactive() || session.busy || !candidate) return;
    setClosedKey(key);
    dismissPriority(key); // Local presentation only; still available in the full command list.
  };
  const openDetails = () => {
    if (!interactive() || session.busy || !candidate) return;
    pendingRoute.current = candidate.id;
    session.leaving = true;
    setClosedKey(key);
  };
  const onDismiss = () => {
    const id = pendingRoute.current;
    pendingRoute.current = null;
    if (id && current() && session.active && AppState.currentState === 'active') {
      if (onOpenRequestDetail) onOpenRequestDetail(id);
      else router.push({ pathname: '/request-details/[id]', params: { id } });
    }
  };
  useEffect(() => {
    if (!enabled) { pendingRoute.current = null; session.leaving = false; }
  }, [enabled, session]);

  const accept = async () => {
    if (!interactive() || session.busy || !canAccept || !latest.current.canAccept ||
      latest.current.requestId !== live?.id || !live || !vehicle || !isTripRequestWithinAcceptanceWindow(live)) return;
    session.busy = true; // Synchronous lock, including two taps before React commits.
    setFlight(live);
    setFailure({ requestId: live.id, message: '' });
    try {
      // Same endpoint as the detail; backend remains authoritative for price, schedule and ownership.
      const departureDate = new Date(Math.min(Math.max(Date.parse(live.departureDateMin), Date.now()), Date.parse(live.departureDateMax)));
      await acceptRequest({ tripRequestId: live.id, payload: { vehicleId: vehicle.id,
        departureDate: departureDate.toISOString(), requiresPassengerKyc: false } }).unwrap();
      if (!current()) return;
      // The existing fulfilled-mutation middleware owns alert/audio cleanup.
      // Do not start a parallel native cleanup path from this modal.
      dismissPriority(homePriorityKeys.nearbyRequest(live));
      session.leaving = session.active && AppState.currentState === 'active';
      setClosedKey(homePriorityKeys.nearbyRequest(live));
      if (session.active && AppState.currentState === 'active') pendingRoute.current = live.id;
    } catch (error) {
      if (current()) setFailure({ requestId: live.id,
        message: getApiErrorMessage(error, 'Acceptation non confirmée. Vérifiez la connexion ou ouvrez les détails.') });
    } finally {
      session.busy = false;
      if (current()) setFlight(null);
    }
  };
  const retry = () => {
    if (!interactive() || !readsEnabled || session.busy) return;
    void detail.refetch().catch(() => {});
    void vehiclesQuery.refetch().catch(() => {});
  };
  return { order, visible, vehicles, vehicle, canAccept, loading, readError, available, isIdentityVerified,
    busy: Boolean(flight), error: failure.requestId === order?.id ? failure.message : '',
    selectVehicle: (vehicleId: string) => {
      if (interactive() && !session.busy && order) setVehicleChoice({ requestId: order.id, vehicleId });
    }, close, openDetails, onDismiss, accept, retry };
}
