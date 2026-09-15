import { areTripMapCoordinatesSame, getGeoPointCoordinate, normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import {
  MAX_PLAUSIBLE_LOCATION_JUMP_METERS,
  isPlausibleLocationUpdate,
  type NavigationCoordinate,
} from '@/utils/navigation/routeProgress';
import React, { useEffect, useMemo } from 'react';
import type { Trip } from '@/types';

interface Params {
  trip: Trip | undefined;
  lastUpdate: Date | null;
  driverLocation: { latitude: number; longitude: number; } | null;
  lastAcceptedDriverCoordinateRef: React.RefObject<NavigationCoordinate | null>;
  lastAcceptedDriverTimestampRef: React.RefObject<number | null>;
  setDriverLocation: React.Dispatch<React.SetStateAction<{ latitude: number; longitude: number; } | null>>;
  setLastUpdate: React.Dispatch<React.SetStateAction<Date | null>>;
  driverLocationSnapshot: { tripId: string; coordinates: [number, number] | null; updatedAt: string | null; } | undefined;
}

export function usePassengerDriverLocationSync({
  trip,
  lastUpdate,
  driverLocation,
  lastAcceptedDriverCoordinateRef,
  lastAcceptedDriverTimestampRef,
  setDriverLocation,
  setLastUpdate,
  driverLocationSnapshot,
}: Params) {
  const tripDriverLocation = useMemo(
    () => getGeoPointCoordinate(trip?.currentLocation ?? null),
    [trip?.currentLocation],
  );

  useEffect(() => {
    if (!tripDriverLocation) {
      return;
    }

    const apiUpdatedAt = trip?.lastLocationUpdateAt ? new Date(trip.lastLocationUpdateAt) : null;
    const hasFreshApiLocation = Boolean(
      apiUpdatedAt &&
        !Number.isNaN(apiUpdatedAt.getTime()) &&
        (!lastUpdate || apiUpdatedAt.getTime() > lastUpdate.getTime()),
    );

    if (!driverLocation || hasFreshApiLocation) {
      const apiTimestamp = apiUpdatedAt?.getTime() ?? Date.now();
      if (
        !isPlausibleLocationUpdate({
          previous: lastAcceptedDriverCoordinateRef.current,
          current: tripDriverLocation,
          previousTimestamp: lastAcceptedDriverTimestampRef.current,
          currentTimestamp: apiTimestamp,
          maxJumpMeters: MAX_PLAUSIBLE_LOCATION_JUMP_METERS,
        })
      ) {
        return;
      }

      lastAcceptedDriverCoordinateRef.current = tripDriverLocation;
      lastAcceptedDriverTimestampRef.current = apiTimestamp;
      setDriverLocation(tripDriverLocation);
      if (apiUpdatedAt && !Number.isNaN(apiUpdatedAt.getTime())) {
        setLastUpdate(apiUpdatedAt);
      }
    }
  }, [driverLocation, lastUpdate, trip?.lastLocationUpdateAt, tripDriverLocation]);

  useEffect(() => {
    if (!driverLocationSnapshot?.coordinates) {
      return;
    }

    const coordinate = normalizeTripMapCoordinate(
      driverLocationSnapshot.coordinates[1],
      driverLocationSnapshot.coordinates[0],
    );
    if (!coordinate) {
      return;
    }

    const snapshotUpdatedAtMs = driverLocationSnapshot.updatedAt
      ? new Date(driverLocationSnapshot.updatedAt).getTime()
      : null;
    const hasSnapshotUpdatedAt =
      typeof snapshotUpdatedAtMs === 'number' &&
      Number.isFinite(snapshotUpdatedAtMs);
    const lastUpdateMs = lastUpdate?.getTime();
    const shouldApplySnapshot =
      !driverLocation ||
      (hasSnapshotUpdatedAt &&
        (!Number.isFinite(lastUpdateMs) || snapshotUpdatedAtMs > lastUpdateMs!));

    if (shouldApplySnapshot) {
      const snapshotTimestamp = hasSnapshotUpdatedAt ? snapshotUpdatedAtMs : Date.now();
      if (
        areTripMapCoordinatesSame(driverLocation, coordinate) &&
        lastAcceptedDriverTimestampRef.current === snapshotTimestamp
      ) {
        return;
      }

      if (
        !isPlausibleLocationUpdate({
          previous: lastAcceptedDriverCoordinateRef.current,
          current: coordinate,
          previousTimestamp: lastAcceptedDriverTimestampRef.current,
          currentTimestamp: snapshotTimestamp,
          maxJumpMeters: MAX_PLAUSIBLE_LOCATION_JUMP_METERS,
        })
      ) {
        return;
      }

      lastAcceptedDriverCoordinateRef.current = coordinate;
      lastAcceptedDriverTimestampRef.current = snapshotTimestamp;
      setDriverLocation(coordinate);
      setLastUpdate(new Date(snapshotTimestamp));
    }
  }, [driverLocation, driverLocationSnapshot, lastUpdate]);

  return {

  };
}
