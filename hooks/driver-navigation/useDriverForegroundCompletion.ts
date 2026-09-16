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
import React, { useCallback } from 'react';
import { type AppStateStatus } from 'react-native';
import type { MapCoordinate } from '@/utils/tripCoordinates';

interface Params {
  tripId: string;
  trip: Trip | undefined;
  tripArrivalCoordinate: MapCoordinate | null;
  isRestCompletionCheckRunningRef: React.RefObject<boolean>;
  lastRestCompletionCheckAtRef: React.RefObject<number>;
  refetchTrip: ReturnType<typeof useGetTripByIdQuery>['refetch'];
  refetchBookings: ReturnType<typeof useGetTripBookingsQuery>['refetch'];
  bookingsRef: React.RefObject<Booking[] | undefined>;
  presentCompletedTripFromServerSync: (completedTrip?: Trip | null, options?: { completedWhileAppInactive?: boolean; }) => boolean;
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
  tryCompleteTripFromNavigation: (distanceMeters?: number, options?: { completedWhileAppInactive?: boolean; }) => void;
  appStateRef: React.RefObject<AppStateStatus>;
}

export function useDriverForegroundCompletion({
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
}: Params) {
  const checkTripCompletionFromRestOnForeground = useCallback(async () => {
    if (
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

    isRestCompletionCheckRunningRef.current = true;
    lastRestCompletionCheckAtRef.current = now;

    try {
      const [tripResult, bookingsResult] = await Promise.all([
        refetchTrip(),
        refetchBookings(),
      ]);
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
        const restLocationSnapshot = await getDriverLocationSnapshot(tripId, false).unwrap();
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

      let location: Location.LocationObject | null = null;
      try {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
      } catch {
        location = await Location.getLastKnownPositionAsync({
          maxAge: 15 * 60_000,
          requiredAccuracy: MAX_ACCEPTABLE_GPS_ACCURACY_METERS,
        });
      }

      if (!isMountedRef.current) {
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
          const safeLocationTimestamp = Number.isFinite(locationTimestamp)
            ? locationTimestamp
            : now;
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

      const orderedCandidates = completionCandidates.sort(
        (a, b) => a.timestampMs - b.timestampMs,
      );
      const firstCandidate = orderedCandidates[0];
      let previousDriverCoordinate =
        lastTripCompletionCheckCoordinateRef.current ??
        lastAcceptedDriverCoordinateRef.current;
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
          coordinates: [
            latestCandidate.coordinate.longitude,
            latestCandidate.coordinate.latitude,
          ],
          ...(location &&
          typeof location.coords.accuracy === 'number' &&
          location.coords.accuracy >= 0
            ? { accuracy: location.coords.accuracy }
            : {}),
          ...(location && typeof location.coords.speed === 'number' && location.coords.speed >= 0
            ? { speed: location.coords.speed }
            : {}),
          ...(location &&
          typeof location.coords.heading === 'number' &&
          location.coords.heading >= 0
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

      if (completionDistanceMeters !== null) {
        tryCompleteTripFromNavigation(completionDistanceMeters, {
          completedWhileAppInactive: completedDuringInactiveCandidateRef.current,
        });
      }
    } catch (error) {
      console.warn('[Navigation] Vérification REST de fin de trajet impossible:', error);
    } finally {
      if (appStateRef.current === 'active') {
        completedDuringInactiveCandidateRef.current = false;
      }
      isRestCompletionCheckRunningRef.current = false;
    }
  }, [
    getDriverLocationSnapshot,
    getTripDestinationReferenceRoute,
    presentCompletedTripFromServerSync,
    refetchBookings,
    refetchTrip,
    trip,
    tripArrivalCoordinate,
    tripId,
    tryCompleteTripFromNavigation,
    updateDriverLocation,
  ]);

  return {
    checkTripCompletionFromRestOnForeground,
  };
}
