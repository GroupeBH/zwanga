import type { NavigationCoordinate } from '@/utils/navigation/routeProgress';
import { RouteStep, LivePassengerLocation } from '../../features/driver-navigation/navigationModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { stopDriverBackgroundLocationTracking } from '@/services/driverBackgroundLocationTask';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { useGetTripBookingsQuery } from '@/store/api/bookingApi';
import {
  useGetTripByIdQuery,
  usePauseTripMutation,
  useRequestDriverTripInterruptionMutation,
  useStartTripMutation,
} from '@/store/api/tripApi';
import type { Trip, TripInterruptionReason } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';

interface Params {
  isScreenActive: boolean;
  navigateBackSafely: () => void;
  isExitingRef: React.RefObject<boolean>;
  tripId: string;
  isRestartingTrip: boolean;
  isTripFetching: boolean;
  startTrip: ReturnType<typeof useStartTripMutation>[0];
  lastRouteFetchTimeRef: React.RefObject<number>;
  routeFetchedRef: React.RefObject<boolean>;
  routeSignatureRef: React.RefObject<string>;
  hasFetchedInitialDriverRouteRef: React.RefObject<boolean>;
  offRouteSampleCountRef: React.RefObject<number>;
  lastOffRouteRerouteAtRef: React.RefObject<number>;
  setRouteCoordinates: React.Dispatch<React.SetStateAction<NavigationCoordinate[]>>;
  setRouteDistanceMeters: React.Dispatch<React.SetStateAction<number | null>>;
  setRouteDurationSeconds: React.Dispatch<React.SetStateAction<number | null>>;
  setSteps: React.Dispatch<React.SetStateAction<RouteStep[]>>;
  setCurrentStepIndex: React.Dispatch<React.SetStateAction<number>>;
  refetchTrip: ReturnType<typeof useGetTripByIdQuery>['refetch'];
  refetchBookings: ReturnType<typeof useGetTripBookingsQuery>['refetch'];
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  reconcileTripStatus: (error: unknown, expectedStatuses: readonly string[]) => Promise<Trip | null>;
  pauseTrip: ReturnType<typeof usePauseTripMutation>[0];
  locationSubscription: React.RefObject<Location.LocationSubscription | null>;
  currentLocationRef: React.RefObject<Location.LocationObject | null>;
  setIsSocketConnected: React.Dispatch<React.SetStateAction<boolean>>;
  setLivePassengerLocations: React.Dispatch<React.SetStateAction<Record<string, LivePassengerLocation>>>;
  cleanupNavigationUi: () => void;
  requestDriverTripInterruption: ReturnType<typeof useRequestDriverTripInterruptionMutation>[0];
}

export function useDriverTripInterruptionActions({
  isScreenActive,
  navigateBackSafely,
  isExitingRef,
  tripId,
  isRestartingTrip,
  isTripFetching,
  startTrip,
  lastRouteFetchTimeRef,
  routeFetchedRef,
  routeSignatureRef,
  hasFetchedInitialDriverRouteRef,
  offRouteSampleCountRef,
  lastOffRouteRerouteAtRef,
  setRouteCoordinates,
  setRouteDistanceMeters,
  setRouteDurationSeconds,
  setSteps,
  setCurrentStepIndex,
  refetchTrip,
  refetchBookings,
  showDialog,
  reconcileTripStatus,
  pauseTrip,
  locationSubscription,
  currentLocationRef,
  setIsSocketConnected,
  setLivePassengerLocations,
  cleanupNavigationUi,
  requestDriverTripInterruption,
}: Params) {
  // Late replies cannot redirect a different screen or clear its location refs.
  const session = useMemo(() => ({ tripId, active: true, mounted: true, busy: false }), [tripId]);
  const scope = useMemo(() => ({ tripId, isScreenActive, version: getTokenSessionVersion() }), [tripId, isScreenActive]);
  const latestScope = useRef(scope);
  latestScope.current = scope;
  session.active = isScreenActive;
  useEffect(() => {
    session.mounted = true;
    return () => { session.mounted = false; };
  }, [session]);
  const canUpdateNavigation = useCallback(() => session.mounted && session.active && !isExitingRef.current &&
    latestScope.current === scope && scope.version === getTokenSessionVersion(), [isExitingRef, scope, session]);
  const refreshInBackground = useCallback(() => {
    // Slow follow-up reads must neither hold the exit nor turn success into failure.
    void Promise.allSettled([
      Promise.resolve().then(() => refetchTrip()),
      Promise.resolve().then(() => refetchBookings()),
    ]);
  }, [refetchBookings, refetchTrip]);
  const handleRestartTripFromNavigation = useCallback(async () => {
    if (!tripId || isRestartingTrip || isTripFetching || session.busy || !canUpdateNavigation()) return;
    session.busy = true;
    try {
      try {
        await startTrip(tripId).unwrap();
      } catch (error) {
        if (!canUpdateNavigation()) return;
        const restarted = await reconcileTripStatus(error, ['ongoing']);
        if (!canUpdateNavigation()) return;
        if (!restarted) throw error;
      }
      if (!canUpdateNavigation()) return;
      lastRouteFetchTimeRef.current = 0;
      routeFetchedRef.current = false;
      routeSignatureRef.current = '';
      hasFetchedInitialDriverRouteRef.current = false;
      offRouteSampleCountRef.current = 0;
      lastOffRouteRerouteAtRef.current = 0;
      setRouteCoordinates([]);
      setRouteDistanceMeters(null);
      setRouteDurationSeconds(null);
      setSteps([]);
      setCurrentStepIndex(0);
      refreshInBackground();
      showDialog({
        variant: 'success', icon: 'play-circle', title: 'Trajet redémarré',
        message: 'La navigation va reprendre depuis votre position actuelle.',
      });
    } catch (error) {
      if (canUpdateNavigation()) showDialog({
        variant: 'danger', icon: 'alert-circle', title: 'Redémarrage impossible',
        message: getApiErrorMessage(error, 'Impossible de redémarrer ce trajet.'),
      });
    } finally { session.busy = false; }
  }, [
    tripId, isRestartingTrip, isTripFetching, session, canUpdateNavigation, startTrip, reconcileTripStatus,
    lastRouteFetchTimeRef, routeFetchedRef, routeSignatureRef, hasFetchedInitialDriverRouteRef,
    offRouteSampleCountRef, lastOffRouteRerouteAtRef, setRouteCoordinates, setRouteDistanceMeters,
    setRouteDurationSeconds, setSteps, setCurrentStepIndex, refreshInBackground, showDialog,
  ]);

  const pauseTripWithoutPassengerConfirmation = useCallback(async () => {
    if (!tripId || session.busy || !canUpdateNavigation()) return;
    session.busy = true;

    try {
      await pauseTrip(tripId).unwrap();
    } catch (error: any) {
      const pausedTrip = await reconcileTripStatus(error, ['upcoming']);
      if (!pausedTrip) {
        session.busy = false;
        if (canUpdateNavigation()) showDialog({
          variant: 'danger',
          icon: 'alert-circle',
          title: 'Interruption impossible',
          message: getApiErrorMessage(error, "Impossible d'interrompre ce trajet."),
        });
        return;
      }
    }
    session.busy = false;
    // Only an acknowledged pause (or a verified snapshot) stops trip tracking.
    void stopDriverBackgroundLocationTracking(tripId);
    if (!canUpdateNavigation()) return;
    locationSubscription.current?.remove();
    locationSubscription.current = null;
    currentLocationRef.current = null;
    setIsSocketConnected(false);
    setLivePassengerLocations({});
    cleanupNavigationUi();
    refreshInBackground();
    navigateBackSafely();
  }, [
    canUpdateNavigation,
    cleanupNavigationUi,
    currentLocationRef,
    locationSubscription,
    navigateBackSafely,
    pauseTrip,
    reconcileTripStatus,
    refreshInBackground,
    session,
    setIsSocketConnected,
    setLivePassengerLocations,
    showDialog,
    tripId,
  ]);

  const sendDriverInterruptionRequest = useCallback(
    async (reason: TripInterruptionReason) => {
      if (!tripId || session.busy || !canUpdateNavigation()) return;
      session.busy = true;

      const currentCoordinate = currentLocationRef.current
        ? normalizeTripMapCoordinate(
            currentLocationRef.current.coords.latitude,
            currentLocationRef.current.coords.longitude,
          )
        : null;

      try {
        const updatedTrip = await requestDriverTripInterruption({
          tripId,
          reason,
          note:
            reason === 'emergency'
              ? 'Le conducteur demande une interruption urgente du trajet.'
              : 'Le conducteur demande une interruption du trajet.',
          coordinates: currentCoordinate,
        }).unwrap();
        if (updatedTrip.status === 'upcoming') void stopDriverBackgroundLocationTracking(tripId);
      } catch (error: any) {
        session.busy = false;
        if (canUpdateNavigation()) showDialog({
          variant: 'danger',
          icon: 'alert-circle',
          title: 'Demande impossible',
          message: getApiErrorMessage(error, "Impossible d'envoyer la demande d'interruption."),
        });
        return;
      }
      session.busy = false;
      if (!canUpdateNavigation()) return;
      // Pending passenger approval is NOT a pause: background tracking stays on.
      cleanupNavigationUi();
      refreshInBackground();
      navigateBackSafely();
    },
    [
      canUpdateNavigation,
      cleanupNavigationUi,
      currentLocationRef,
      navigateBackSafely,
      refreshInBackground,
      requestDriverTripInterruption,
      session,
      showDialog,
      tripId,
    ],
  );

  return {
    pauseTripWithoutPassengerConfirmation,
    sendDriverInterruptionRequest,
    handleRestartTripFromNavigation,
  };
}
