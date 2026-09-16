import type { NavigationCoordinate } from '@/utils/navigation/routeProgress';
import { RouteStep, LivePassengerLocation } from '../../features/driver-navigation/navigationModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { stopDriverBackgroundLocationTracking } from '@/services/driverBackgroundLocationTask';
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
import React, { useCallback } from 'react';

interface Params {
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
  const handleRestartTripFromNavigation = useCallback(async () => {
    if (!tripId || isRestartingTrip || isTripFetching) {
      return;
    }

    try {
      await startTrip(tripId).unwrap();
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
      await Promise.all([refetchTrip(), refetchBookings()]);
      showDialog({
        variant: 'success',
        icon: 'play-circle',
        title: 'Trajet redémarré',
        message: 'La navigation va reprendre depuis votre position actuelle.',
      });
    } catch (error: any) {
      const restartedTrip = await reconcileTripStatus(error, ['ongoing']);
      if (restartedTrip) {
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
        await Promise.all([refetchTrip(), refetchBookings()]);
        showDialog({
          variant: 'success',
          icon: 'play-circle',
          title: 'Trajet redémarré',
          message: 'Le trajet a bien redémarré malgré la connexion lente.',
        });
        return;
      }
      showDialog({
        variant: 'danger',
        icon: 'alert-circle',
        title: 'Redemarrage impossible',
        message: getApiErrorMessage(error, 'Impossible de redémarrer ce trajet.'),
      });
    }
  }, [
    isRestartingTrip,
    isTripFetching,
    refetchBookings,
    refetchTrip,
    reconcileTripStatus,
    showDialog,
    startTrip,
    tripId,
  ]);

  const pauseTripWithoutPassengerConfirmation = useCallback(async () => {
    if (!tripId) return;

    try {
      await pauseTrip(tripId).unwrap();
      void stopDriverBackgroundLocationTracking(tripId);
      locationSubscription.current?.remove();
      locationSubscription.current = null;
      currentLocationRef.current = null;
      setIsSocketConnected(false);
      setLivePassengerLocations({});
      cleanupNavigationUi();
      refetchTrip();
      refetchBookings();
      showDialog({
        variant: 'success',
        icon: 'checkmark-circle',
        title: 'Trajet interrompu',
        message: 'Le trajet a été interrompu avec succès.',
      });
    } catch (error: any) {
      const pausedTrip = await reconcileTripStatus(error, ['upcoming']);
      if (pausedTrip) {
        void stopDriverBackgroundLocationTracking(tripId);
        locationSubscription.current?.remove();
        locationSubscription.current = null;
        currentLocationRef.current = null;
        setIsSocketConnected(false);
        setLivePassengerLocations({});
        cleanupNavigationUi();
        await Promise.all([refetchTrip(), refetchBookings()]);
        showDialog({
          variant: 'success',
          icon: 'checkmark-circle',
          title: 'Trajet interrompu',
          message: 'Le trajet a bien été interrompu malgré la connexion lente.',
        });
        return;
      }
      showDialog({
        variant: 'danger',
        icon: 'alert-circle',
        title: 'Interruption impossible',
        message: getApiErrorMessage(error, "Impossible d'interrompre ce trajet."),
      });
    }
  }, [
    cleanupNavigationUi,
    pauseTrip,
    reconcileTripStatus,
    refetchBookings,
    refetchTrip,
    showDialog,
    tripId,
  ]);

  const sendDriverInterruptionRequest = useCallback(
    async (reason: TripInterruptionReason) => {
      if (!tripId) return;

      const currentCoordinate = currentLocationRef.current
        ? normalizeTripMapCoordinate(
            currentLocationRef.current.coords.latitude,
            currentLocationRef.current.coords.longitude,
          )
        : null;

      try {
        await requestDriverTripInterruption({
          tripId,
          reason,
          note:
            reason === 'emergency'
              ? 'Le conducteur demande une interruption urgente du trajet.'
              : 'Le conducteur demande une interruption du trajet.',
          coordinates: currentCoordinate,
        }).unwrap();
        await Promise.all([refetchTrip(), refetchBookings()]);
        showDialog({
          variant: 'success',
          icon: 'send',
          title: 'Demande envoyée',
          message: 'Tous les passagers à bord doivent confirmer avant interruption du trajet.',
        });
      } catch (error: any) {
        showDialog({
          variant: 'danger',
          icon: 'alert-circle',
          title: 'Demande impossible',
          message: getApiErrorMessage(error, "Impossible d'envoyer la demande d'interruption."),
        });
      }
    },
    [
      refetchBookings,
      refetchTrip,
      requestDriverTripInterruption,
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
