import { hasUpcomingDeparture, HOME_MIN_AVAILABLE_SEATS, HOME_PASSIVE_LIST_POLL_MS, roundCoordinate } from '@/features/home/homeModel';
import {
  type TripSearchByPointsPayload,
  useGetTripsByCoordinatesQuery,
  useGetTripsQuery
} from '@/store/api/tripApi';
import { setTrips } from '@/store/slices/tripsSlice';
import { getHomeTripSuggestionTier, HOME_SUGGESTION_RADIUS_KM } from '@/features/home/homeTripPriority';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { useCallback, useEffect, useMemo } from 'react';
import { displayReadOptions, useDisplayReadsEnabled, useDisplayRefetch } from '@/hooks/useDisplayReads';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeLocation } from '@/hooks/home/useHomeLocation';
import type { useHomePassengerActivity } from '@/hooks/home/useHomePassengerActivity';
const EMPTY_TRIP_IDS = new Set<string>();
type Props =
  Pick<ReturnType<typeof useHomeLocation>,
    'lastKnownLocation'
  >
  & Pick<ReturnType<typeof useHomeContext>,
    'isFocused'
    | 'storedTrips'
    | 'dispatch'
    | 'currentUser'
  > & Pick<ReturnType<typeof useHomePassengerActivity>, 'bookedTripIds' | 'completedBookingTripIds'>;
export function useHomeTripFeed({
  lastKnownLocation,
  isFocused,
  storedTrips,
  dispatch,
  currentUser,
  bookedTripIds = EMPTY_TRIP_IDS,
  completedBookingTripIds = EMPTY_TRIP_IDS,
}: Props) {
  const enabled = useDisplayReadsEnabled(isFocused);
  const latitude = lastKnownLocation?.coords?.latitude;
  const longitude = lastKnownLocation?.coords?.longitude;
  const roundedLatitude = typeof latitude === 'number' && Number.isFinite(latitude) ? roundCoordinate(latitude) : null;
  const roundedLongitude = typeof longitude === 'number' && Number.isFinite(longitude) ? roundCoordinate(longitude) : null;
  const nearbyTripsPayload = useMemo<TripSearchByPointsPayload | null>(() => {
    const coordinate = normalizeTripMapCoordinate(roundedLatitude, roundedLongitude);
    if (!coordinate) {
      return null;
    }

    return {
      departureCoordinates: [
        coordinate.longitude,
        coordinate.latitude,
      ],
      departureRadiusKm: HOME_SUGGESTION_RADIUS_KM,
      limit: 50,
      minSeats: HOME_MIN_AVAILABLE_SEATS,
    };
  }, [
    roundedLatitude,
    roundedLongitude,
  ]);

  const nearby = useGetTripsByCoordinatesQuery(
    nearbyTripsPayload ?? { departureCoordinates: [0, 0], minSeats: HOME_MIN_AVAILABLE_SEATS },
    displayReadOptions(enabled && Boolean(nearbyTripsPayload), HOME_PASSIVE_LIST_POLL_MS),
  );
  const hasNearbySuggestion = useMemo(() => {
    const point = nearbyTripsPayload?.departureCoordinates;
    const origin = point ? { latitude: point[1], longitude: point[0] } : null;
    const now = Date.now();
    return nearby.currentData?.some(trip => (!currentUser?.id || trip.driverId !== currentUser.id)
      && !bookedTripIds.has(trip.id) && !completedBookingTripIds.has(trip.id)
      && getHomeTripSuggestionTier(trip, origin, now) === 0) ?? false;
    // Recheck time eligibility on existing refreshes, without a new timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearby.currentData, nearby.fulfilledTimeStamp, nearbyTripsPayload, currentUser?.id, bookedTripIds, completedBookingTripIds, enabled]);
  // A general feed must have no geographic/date restriction, including when GPS
  // is unavailable. Local tiers still prefer nearby departures among its candidates.
  const useGeneral = !nearbyTripsPayload || nearby.isError || (nearby.currentData !== undefined && !hasNearbySuggestion);
  const general = useGetTripsQuery({ minSeats: HOME_MIN_AVAILABLE_SEATS, limit: 50, sort: 'date' }, {
    ...displayReadOptions(enabled && useGeneral, HOME_PASSIVE_LIST_POLL_MS),
  });
  // Only fall back after the nearby response; never download both full feeds on mount.
  const remoteTrips = useMemo(() => {
    if (!nearbyTripsPayload) return general.currentData;
    if (!useGeneral) return nearby.currentData;
    if (!general.currentData) return nearby.currentData?.length ? nearby.currentData : undefined;
    // When both scopes are needed, the newest fulfilled response wins duplicates
    // (including newly full/cancelled rides). Once nearby recovers, wide data is ignored.
    const nearbyIsNewer = (nearby.fulfilledTimeStamp ?? 0) >= (general.fulfilledTimeStamp ?? 0);
    const earlier = nearbyIsNewer ? general.currentData : nearby.currentData ?? [];
    const latest = nearbyIsNewer ? nearby.currentData ?? [] : general.currentData;
    const trips = new Map(earlier.map(trip => [trip.id, trip]));
    latest.forEach(trip => trips.set(trip.id, trip));
    return Array.from(trips.values());
  }, [useGeneral, general.currentData, nearby.currentData, general.fulfilledTimeStamp, nearby.fulfilledTimeStamp, nearbyTripsPayload]);
  const selected = useGeneral ? general : nearby;
  const discoveryUpdatedAt = Math.max(nearby.fulfilledTimeStamp ?? 0, useGeneral ? general.fulfilledTimeStamp ?? 0 : 0);
  const hasDisplayableTrips = useMemo(() => {
    const point = nearbyTripsPayload?.departureCoordinates;
    const origin = point ? { latitude: point[1], longitude: point[0] } : null;
    const now = Date.now();
    return (remoteTrips ?? storedTrips).some(trip => (!currentUser?.id || trip.driverId !== currentUser.id)
      && !completedBookingTripIds.has(trip.id)
      && (getHomeTripSuggestionTier(trip, origin, now) >= 0 || (bookedTripIds.has(trip.id)
        && (trip.status === 'upcoming' || trip.status === 'ongoing') && hasUpcomingDeparture(trip))));
    // Same freshness signals as selection: no new polling or per-render scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteTrips, storedTrips, nearbyTripsPayload, currentUser?.id, completedBookingTripIds, bookedTripIds, discoveryUpdatedAt, enabled]);
  const tripsLoading = Boolean(selected.isFetching && !hasDisplayableTrips);
  const tripsError = Boolean(selected.isError && !hasDisplayableTrips);
  const refetchNearby = useDisplayRefetch(enabled && Boolean(nearbyTripsPayload) && !nearby.isUninitialized,
    JSON.stringify(nearbyTripsPayload), nearby.refetch);
  const refetchGeneral = useDisplayRefetch(enabled && useGeneral && !general.isUninitialized,
    JSON.stringify(nearbyTripsPayload), general.refetch);
  const generalUninitialized = general.isUninitialized;
  const refetchTrips = useCallback(async () => {
    if (!enabled) return;
    if (nearbyTripsPayload) {
      const result = await refetchNearby();
      if ((result.error || useGeneral) && !generalUninitialized) return refetchGeneral();
      return result;
    }
    if (!generalUninitialized) return refetchGeneral();
  }, [enabled, nearbyTripsPayload, refetchNearby, refetchGeneral, generalUninitialized, useGeneral]);

  useEffect(() => {
    if (remoteTrips) {
      dispatch(setTrips(remoteTrips.filter(hasUpcomingDeparture).slice(0, 100)));
    }
  }, [remoteTrips, dispatch]);

  const showInitialHomeLoader = tripsLoading && !remoteTrips && storedTrips.length === 0;
  return {
    remoteTrips,
    discoveryUpdatedAt,
    tripsLoading,
    tripsError,
    refetchTrips,
    showInitialHomeLoader,
  };
}
