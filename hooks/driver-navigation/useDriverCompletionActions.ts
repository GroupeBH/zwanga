import type { NavigationCoordinate } from '@/utils/navigation/routeProgress';
import { normalizeDriverLocationObject } from '../../features/driver-navigation/navigationBooking';
import {
  RouteCoordinate,
  BookingAutoProgressEvent,
  TripEndNotice,
  SPEECH_LANGUAGE,
  SPEECH_RATE,
} from '../../features/driver-navigation/navigationModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { stopDriverBackgroundLocationTracking } from '@/services/driverBackgroundLocationTask';
import { useGetTripBookingsQuery } from '@/store/api/bookingApi';
import { useLazyGetDriverTripRevenueSummaryQuery } from '@/store/api/driverSettlementsApi';
import { useCompleteTripMutation, useGetTripByIdQuery } from '@/store/api/tripApi';
import type { Trip } from '@/types';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { calculateDistanceMeters } from '@/utils/navigation/routeProgress';
import { DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS } from '@/utils/navigation/tripCompletion';
import * as Location from 'expo-location';
import { NavigationSpeech as Speech } from '@/utils/navigationSpeech';
import React, { useCallback } from 'react';
import type { MapCoordinate } from '@/utils/tripCoordinates';

interface Params {
  isMountedRef: React.RefObject<boolean>;
  presentedTripDestinationKeysRef: React.RefObject<Set<string>>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  tripEndNoticeRef: React.RefObject<TripEndNotice | null>;
  setTripEndNotice: React.Dispatch<React.SetStateAction<TripEndNotice | null>>;
  getDriverTripRevenueSummary: ReturnType<typeof useLazyGetDriverTripRevenueSummaryQuery>[0];
  tripArrivalCoordinate: MapCoordinate | null;
  currentLocationRef: React.RefObject<Location.LocationObject | null>;
  lastAcceptedDriverCoordinateRef: React.RefObject<NavigationCoordinate | null>;
  tripId: string;
  completedDuringInactiveCandidateRef: React.RefObject<boolean>;
  activeNavigationDestination: { id: string; kind: "pickup" | "dropoff" | "destination"; coordinate: NavigationCoordinate; } | null;
  routeCoordinatesRef: React.RefObject<NavigationCoordinate[]>;
  tripDepartureCoordinate: MapCoordinate | null;
  autoCompletingTripRef: React.RefObject<boolean>;
  trip: Trip | undefined;
  completeTrip: ReturnType<typeof useCompleteTripMutation>[0];
  reconcileTripStatus: (error: unknown, expectedStatuses: readonly string[]) => Promise<Trip | null>;
  refetchTrip: ReturnType<typeof useGetTripByIdQuery>['refetch'];
  refetchBookings: ReturnType<typeof useGetTripBookingsQuery>['refetch'];
}

export function useDriverCompletionActions({
  isMountedRef,
  presentedTripDestinationKeysRef,
  showDialog,
  tripEndNoticeRef,
  setTripEndNotice,
  getDriverTripRevenueSummary,
  tripArrivalCoordinate,
  currentLocationRef,
  lastAcceptedDriverCoordinateRef,
  tripId,
  completedDuringInactiveCandidateRef,
  activeNavigationDestination,
  routeCoordinatesRef,
  tripDepartureCoordinate,
  autoCompletingTripRef,
  trip,
  completeTrip,
  reconcileTripStatus,
  refetchTrip,
  refetchBookings,
}: Params) {
  const presentTripDestinationNotice = useCallback(
    (
      event: BookingAutoProgressEvent,
      options: { completedWhileAppInactive?: boolean } = {},
    ) => {
      if (
        !isMountedRef.current ||
        (event.type !== 'driver_near_destination' && event.type !== 'driver_arrived_destination')
      ) {
        return;
      }

      const roundedDistance =
        typeof event.distanceMeters === 'number' && Number.isFinite(event.distanceMeters)
          ? Math.max(1, Math.round(event.distanceMeters))
          : null;
      const isAutoCompleteZone =
        event.type === 'driver_near_destination' &&
        roundedDistance !== null &&
        roundedDistance <= DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS;
      const key = [
        event.type,
        event.tripId,
        event.type === 'driver_arrived_destination'
          ? 'completed'
          : isAutoCompleteZone
            ? 'auto-complete-zone'
            : 'approach',
      ].join(':');
      if (presentedTripDestinationKeysRef.current.has(key)) {
        return;
      }

      presentedTripDestinationKeysRef.current.add(key);
      if (event.type === 'driver_near_destination') {
        const distanceText = roundedDistance ? ` Distance detectée: ${roundedDistance} m.` : '';

        showDialog({
          variant: 'info',
          icon: 'flag',
          title: isAutoCompleteZone ? 'Zone de destination atteinte' : 'Destination finale proche',
          message: isAutoCompleteZone
            ? `Le véhicule est à moins de ${DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS} m du point d'arrivée. Le trajet sera terminé automatiquement après 10 minutes si le véhicule reste dans cette zone.${distanceText}`
            : `Le point d'arrivée du trajet est presque atteint.${distanceText}`,
        });

        void Speech.stop().finally(() => {
          if (!isMountedRef.current) return;
          Speech.speak(
            isAutoCompleteZone
              ? "Zone d'arrivée atteinte."
              : "Le point d'arrivée du trajet est presque atteint.",
            {
              language: SPEECH_LANGUAGE,
              rate: SPEECH_RATE,
            },
          );
        });
        return;
      }

      const notice: TripEndNotice = {
        tripId: event.tripId,
        completedWhileAppInactive: options.completedWhileAppInactive,
        distanceMeters: event.distanceMeters,
        detectedAt: event.detectedAt,
        revenueSummary: event.revenueSummary,
      };
      tripEndNoticeRef.current = notice;
      setTripEndNotice(notice);

      if (!event.revenueSummary) {
        void getDriverTripRevenueSummary(event.tripId)
          .unwrap()
          .then((revenueSummary) => {
            if (
              !isMountedRef.current ||
              tripEndNoticeRef.current?.tripId !== event.tripId
            ) {
              return;
            }
            const hydratedNotice = {
              ...tripEndNoticeRef.current,
              revenueSummary,
              revenueSummaryUnavailable: false,
            };
            tripEndNoticeRef.current = hydratedNotice;
            setTripEndNotice(hydratedNotice);
          })
          .catch((error) => {
            console.warn('[Navigation] Résumé financier du trajet indisponible:', error);
            if (
              !isMountedRef.current ||
              tripEndNoticeRef.current?.tripId !== event.tripId
            ) {
              return;
            }
            const unavailableNotice = {
              ...tripEndNoticeRef.current,
              revenueSummaryUnavailable: true,
            };
            tripEndNoticeRef.current = unavailableNotice;
            setTripEndNotice(unavailableNotice);
          });
      }

      void Speech.stop().finally(() => {
        if (!isMountedRef.current) return;
        Speech.speak(
          options.completedWhileAppInactive
            ? "Le trajet s'est terminé pendant que l'application était en veille."
            : 'Vous avez atteint la destination finale. Le trajet est terminé automatiquement.',
          {
            language: SPEECH_LANGUAGE,
            rate: SPEECH_RATE,
          },
        );
      });
    },
    [getDriverTripRevenueSummary, showDialog],
  );

  const resolveCompletedTripDistanceMeters = useCallback(
    (completedTrip?: Trip | null) => {
      if (!tripArrivalCoordinate) {
        return undefined;
      }

      const tripLocationCoordinate = normalizeTripMapCoordinate(
        completedTrip?.currentLocation?.coordinates?.[1],
        completedTrip?.currentLocation?.coordinates?.[0],
      );
      const driverLocationCoordinate = normalizeDriverLocationObject(
        currentLocationRef.current,
      );
      const driverCoordinate =
        tripLocationCoordinate ??
        (driverLocationCoordinate
          ? {
              latitude: driverLocationCoordinate.coords.latitude,
              longitude: driverLocationCoordinate.coords.longitude,
            }
          : null) ??
        lastAcceptedDriverCoordinateRef.current;

      if (!driverCoordinate) {
        return undefined;
      }

      const distanceMeters = calculateDistanceMeters(
        driverCoordinate,
        tripArrivalCoordinate,
      );
      return Number.isFinite(distanceMeters)
        ? Math.max(1, Math.round(distanceMeters))
        : undefined;
    },
    [tripArrivalCoordinate],
  );

  const presentCompletedTripFromServerSync = useCallback(
    (
      completedTrip?: Trip | null,
      options: { completedWhileAppInactive?: boolean } = {},
    ) => {
      if (!tripId || completedTrip?.status !== 'completed') {
        return false;
      }

      void stopDriverBackgroundLocationTracking(tripId);
      presentTripDestinationNotice(
        {
          type: 'driver_arrived_destination',
          tripId,
          distanceMeters: resolveCompletedTripDistanceMeters(completedTrip),
          detectedAt: completedTrip.completedAt ?? new Date().toISOString(),
        },
        {
          completedWhileAppInactive: options.completedWhileAppInactive,
        },
      );
      completedDuringInactiveCandidateRef.current = false;
      return true;
    },
    [presentTripDestinationNotice, resolveCompletedTripDistanceMeters, tripId],
  );

  const getTripDestinationReferenceRoute = useCallback((): RouteCoordinate[] => {
    if (
      activeNavigationDestination?.kind === 'destination' &&
      routeCoordinatesRef.current.length >= 2
    ) {
      return routeCoordinatesRef.current;
    }

    return [tripDepartureCoordinate, tripArrivalCoordinate].filter(
      (coordinate): coordinate is RouteCoordinate => Boolean(coordinate),
    );
  }, [activeNavigationDestination?.kind, tripArrivalCoordinate, tripDepartureCoordinate]);

  const tryCompleteTripFromNavigation = useCallback(
    (
      distanceMeters?: number,
      options: {
        completedWhileAppInactive?: boolean;
      } = {},
    ) => {
      if (!tripId || autoCompletingTripRef.current || trip?.status !== 'ongoing') {
        return;
      }

      const complete = async () => {
        try {
          await completeTrip(tripId).unwrap();
          return true;
        } catch (error) {
          return Boolean(await reconcileTripStatus(error, ['completed']));
        }
      };

      autoCompletingTripRef.current = true;
      void complete()
        .then((didComplete) => {
          if (!didComplete) {
            return;
          }

          void stopDriverBackgroundLocationTracking(tripId);
          presentTripDestinationNotice({
            type: 'driver_arrived_destination',
            tripId,
            distanceMeters,
            detectedAt: new Date().toISOString(),
          }, {
            completedWhileAppInactive: options.completedWhileAppInactive,
          });
          completedDuringInactiveCandidateRef.current = false;
          refetchTrip();
          refetchBookings();
        })
        .catch((error) => {
          console.warn('[Navigation] Finalisation automatique du trajet non persistée:', error);
        })
        .finally(() => {
          autoCompletingTripRef.current = false;
        });
    },
    [
      completeTrip,
      presentTripDestinationNotice,
      reconcileTripStatus,
      refetchBookings,
      refetchTrip,
      trip?.status,
      tripId,
    ],
  );

  return {
    presentCompletedTripFromServerSync,
    getTripDestinationReferenceRoute,
    tryCompleteTripFromNavigation,
    presentTripDestinationNotice,
  };
}
