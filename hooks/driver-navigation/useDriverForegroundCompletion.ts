import type { NavigationCoordinate } from '@/utils/navigation/routeProgress';
import { normalizeDriverLocationObject } from '../../features/driver-navigation/navigationBooking';
import { RouteCoordinate } from '../../features/driver-navigation/navigationModel';
import { useGetTripBookingsQuery } from '@/store/api/bookingApi';
import {
  useGetTripByIdQuery,
  useLazyGetDriverLocationQuery,
  useUpdateDriverLocationMutation,
} from '@/store/api/tripApi';
import type { Booking, Trip } from '@/types';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { MAX_ACCEPTABLE_GPS_ACCURACY_METERS } from '@/utils/navigation/routeProgress';
import {
  DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
  DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
  evaluateDestinationAutoComplete,
  evaluateDestinationPassage,
} from '@/utils/navigation/tripCompletion';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef } from 'react';
import { useNavigationRequestGuard } from '@/hooks/navigation/useNavigationRequestGuard';
import { type AppStateStatus } from 'react-native';
import type { MapCoordinate } from '@/utils/tripCoordinates';

interface Params {
  isScreenActive: boolean;
  tripId: string;
  trip: Trip | undefined;
  tripArrivalCoordinate: MapCoordinate | null;
  isRestCompletionCheckRunningRef: React.RefObject<boolean>;
  lastRestCompletionCheckAtRef: React.RefObject<number>;
  refetchTrip: ReturnType<typeof useGetTripByIdQuery>['refetch'];
  refetchBookings: ReturnType<typeof useGetTripBookingsQuery>['refetch'];
  bookingsRef: React.RefObject<Booking[] | undefined>;
  presentCompletedTripFromServerSync: (
    completedTrip?: Trip | null,
    options?: { completedWhileAppInactive?: boolean },
  ) => boolean;
  completedDuringInactiveCandidateRef: React.RefObject<boolean>;
  lastAcceptedDriverTimestampRef: React.RefObject<number | null>;
  getDriverLocationSnapshot: ReturnType<typeof useLazyGetDriverLocationQuery>[0];
  isMountedRef: React.RefObject<boolean>;
  lastTripCompletionCheckCoordinateRef: React.RefObject<NavigationCoordinate | null>;
  lastAcceptedDriverCoordinateRef: React.RefObject<NavigationCoordinate | null>;
  tripDestinationNearSinceMsRef: React.RefObject<number | null>;
  getTripDestinationReferenceRoute: () => RouteCoordinate[];
  currentLocationRef: React.RefObject<Location.LocationObject | null>;
  setCurrentLocation: React.Dispatch<React.SetStateAction<Location.LocationObject | null>>;
  updateDriverLocation: ReturnType<typeof useUpdateDriverLocationMutation>[0];
  tryCompleteTripFromNavigation: (
    distanceMeters?: number,
    options?: { completedWhileAppInactive?: boolean },
  ) => void;
  appStateRef: React.RefObject<AppStateStatus>;
}

export function useDriverForegroundCompletion(params: Params) {
  const latest = useRef(params);
  latest.current = params;
  const { begin } = useNavigationRequestGuard(params.isScreenActive, params.tripId);
  useEffect(
    () => () => {
      // A cancelled recovery must not block the next foreground session, even if
      // its shared REST read or native GPS promise has not settled yet.
      params.isRestCompletionCheckRunningRef.current = false;
      params.lastRestCompletionCheckAtRef.current = 0;
    },
    [
      params.isScreenActive,
      params.tripId,
      params.isRestCompletionCheckRunningRef,
      params.lastRestCompletionCheckAtRef,
    ],
  );
  const checkTripCompletionFromRestOnForeground = useCallback(async () => {
    const {
      tripId,
      trip,
      tripArrivalCoordinate,
      isRestCompletionCheckRunningRef,
      lastRestCompletionCheckAtRef,
      refetchTrip,
      refetchBookings,
      bookingsRef,
      presentCompletedTripFromServerSync,
      completedDuringInactiveCandidateRef,
      lastAcceptedDriverTimestampRef,
      getDriverLocationSnapshot,
      isMountedRef,
      lastTripCompletionCheckCoordinateRef,
      lastAcceptedDriverCoordinateRef,
      tripDestinationNearSinceMsRef,
      getTripDestinationReferenceRoute,
      currentLocationRef,
      setCurrentLocation,
      updateDriverLocation,
      tryCompleteTripFromNavigation,
      appStateRef,
    } = latest.current;
    if (
      !latest.current.isScreenActive ||
      appStateRef.current !== 'active' ||
      !tripId ||
      trip?.status !== 'ongoing' ||
      !tripArrivalCoordinate ||
      isRestCompletionCheckRunningRef.current
    ) {
      return;
    }

    const now = Date.now();
    if (now - lastRestCompletionCheckAtRef.current < 5000) {
      return;
    }
    const request = begin(tripId);
    if (!request) return;
    const isCurrent = () =>
      request.isCurrent() &&
      isMountedRef.current &&
      latest.current.tripId === tripId &&
      latest.current.isScreenActive &&
      appStateRef.current === 'active';

    isRestCompletionCheckRunningRef.current = true;
    lastRestCompletionCheckAtRef.current = now;

    try {
      const [tripResult, bookingsResult] = await Promise.all([refetchTrip(), refetchBookings()]);
      if (!isCurrent()) return;
      const refreshedTrip = (tripResult as { data?: Trip }).data ?? trip;
      const refreshedBookings = (bookingsResult as { data?: Booking[] }).data;
      if (refreshedBookings) {
        bookingsRef.current = refreshedBookings;
      }

      if (refreshedTrip?.status === 'completed') {
        presentCompletedTripFromServerSync(refreshedTrip, {
          completedWhileAppInactive: completedDuringInactiveCandidateRef.current,
        });
        return;
      }

      if (refreshedTrip?.status !== 'ongoing') {
        return;
      }

      const completionCandidates: {
        source: 'rest' | 'device';
        coordinate: RouteCoordinate;
        timestampMs: number;
        location?: Location.LocationObject | null;
      }[] = [];
      const previousAcceptedTimestamp = lastAcceptedDriverTimestampRef.current ?? 0;

      try {
        const snapshotRequest = getDriverLocationSnapshot(tripId, false);
        request.attach(snapshotRequest);
        const restLocationSnapshot = await snapshotRequest.unwrap();
        if (!isCurrent()) return;
        const restCoordinate = normalizeTripMapCoordinate(
          restLocationSnapshot.coordinates?.[1],
          restLocationSnapshot.coordinates?.[0],
        );
        const restTimestamp = restLocationSnapshot.updatedAt
          ? new Date(restLocationSnapshot.updatedAt).getTime()
          : now;

        if (
          restCoordinate &&
          Number.isFinite(restTimestamp) &&
          restTimestamp + 2000 >= previousAcceptedTimestamp
        ) {
          completionCandidates.push({
            source: 'rest',
            coordinate: restCoordinate,
            timestampMs: restTimestamp,
          });
        }
      } catch (error) {
        console.warn('[Navigation] Position REST du conducteur indisponible au retour dans l’app :', error);
      }

      if (!isCurrent()) return;
      // The shared ride stream already owns GPS. Do not request another fix while it is fresh.
      let location = normalizeDriverLocationObject(currentLocationRef.current);
      const age = location ? Date.now() - location.timestamp : Infinity;
      const accuracy = location?.coords.accuracy;
      if (
        age < 0 ||
        age > 10_000 ||
        (typeof accuracy === 'number' && accuracy > MAX_ACCEPTABLE_GPS_ACCURACY_METERS)
      ) {
        try {
          location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        } catch {
          if (!isCurrent()) return;
          location = await Location.getLastKnownPositionAsync({
            maxAge: 15 * 60_000,
            requiredAccuracy: MAX_ACCEPTABLE_GPS_ACCURACY_METERS,
          });
        }
      }

      if (!isCurrent()) {
        return;
      }

      const normalizedLocation = normalizeDriverLocationObject(location);
      if (normalizedLocation) {
        const accuracy = normalizedLocation.coords.accuracy;
        if (
          typeof accuracy !== 'number' ||
          !Number.isFinite(accuracy) ||
          accuracy <= MAX_ACCEPTABLE_GPS_ACCURACY_METERS
        ) {
          const locationTimestamp = Number(normalizedLocation.timestamp);
          const safeLocationTimestamp = Number.isFinite(locationTimestamp) ? locationTimestamp : now;
          if (safeLocationTimestamp + 2000 >= previousAcceptedTimestamp) {
            completionCandidates.push({
              source: 'device',
              coordinate: {
                latitude: normalizedLocation.coords.latitude,
                longitude: normalizedLocation.coords.longitude,
              },
              timestampMs: safeLocationTimestamp,
              location: normalizedLocation,
            });
          }
        }
      }

      if (completionCandidates.length === 0) {
        return;
      }

      const orderedCandidates = completionCandidates.sort((a, b) => a.timestampMs - b.timestampMs);
      const firstCandidate = orderedCandidates[0];
      let previousDriverCoordinate =
        lastTripCompletionCheckCoordinateRef.current ?? lastAcceptedDriverCoordinateRef.current;
      let nearDestinationSinceMs = tripDestinationNearSinceMsRef.current;
      let completionDistanceMeters: number | null = null;
      const destinationReferenceRoute = getTripDestinationReferenceRoute();

      for (const candidate of orderedCandidates) {
        const passage = evaluateDestinationPassage({
          destinationCoordinate: tripArrivalCoordinate,
          driverCoordinate: candidate.coordinate,
          previousDriverCoordinate,
          routeCoordinates: destinationReferenceRoute,
          directDistanceThresholdMeters: DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
          parallelDistanceThresholdMeters: DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
        });
        const dwellEvaluation = evaluateDestinationAutoComplete({
          destinationCoordinate: tripArrivalCoordinate,
          driverCoordinate: candidate.coordinate,
          nearDestinationSinceMs,
          nowMs: candidate.timestampMs,
        });

        nearDestinationSinceMs = dwellEvaluation.nearDestinationSinceMs;
        previousDriverCoordinate = candidate.coordinate;

        if (passage.shouldComplete || dwellEvaluation.shouldComplete) {
          completionDistanceMeters = Math.round(
            passage.distanceMeters ?? dwellEvaluation.distanceMeters ?? 0,
          );
          break;
        }
      }

      tripDestinationNearSinceMsRef.current = nearDestinationSinceMs;
      const latestCandidate = orderedCandidates[orderedCandidates.length - 1] ?? firstCandidate;
      lastAcceptedDriverCoordinateRef.current = latestCandidate.coordinate;
      lastAcceptedDriverTimestampRef.current = latestCandidate.timestampMs;
      lastTripCompletionCheckCoordinateRef.current = latestCandidate.coordinate;

      if (latestCandidate.location) {
        currentLocationRef.current = latestCandidate.location;
        setCurrentLocation(latestCandidate.location);
      }

      if (latestCandidate.source === 'device') {
        const location = latestCandidate.location;
        await updateDriverLocation({
          tripId,
          coordinates: [latestCandidate.coordinate.longitude, latestCandidate.coordinate.latitude],
          ...(location && typeof location.coords.accuracy === 'number' && location.coords.accuracy >= 0
            ? { accuracy: location.coords.accuracy }
            : {}),
          ...(location && typeof location.coords.speed === 'number' && location.coords.speed >= 0
            ? { speed: location.coords.speed }
            : {}),
          ...(location && typeof location.coords.heading === 'number' && location.coords.heading >= 0
            ? { heading: location.coords.heading }
            : {}),
          ...(location && Number.isFinite(location.timestamp)
            ? { recordedAt: new Date(location.timestamp).toISOString() }
            : {}),
        })
          .unwrap()
          .catch((error) => {
            console.warn('[Navigation] Position REST retour app non envoyée:', error);
          });
      }

      if (isCurrent() && completionDistanceMeters !== null) {
        tryCompleteTripFromNavigation(completionDistanceMeters, {
          completedWhileAppInactive: completedDuringInactiveCandidateRef.current,
        });
      }
    } catch (error) {
      console.warn('[Navigation] Vérification REST de fin de trajet impossible:', error);
    } finally {
      if (isCurrent()) {
        completedDuringInactiveCandidateRef.current = false;
        isRestCompletionCheckRunningRef.current = false;
      }
      request.finish();
    }
  }, [begin]);

  return {
    checkTripCompletionFromRestOnForeground,
  };
}
