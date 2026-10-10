import { hasUpcomingDeparture, HOME_MIN_AVAILABLE_SEATS, HOME_PASSIVE_LIST_POLL_MS, roundCoordinate } from '@/features/home/homeModel';
import {
  type TripSearchByPointsPayload,
  useGetTripsByCoordinatesQuery,
  useGetTripsQuery
} from '@/store/api/tripApi';
import { setTrips } from '@/store/slices/tripsSlice';
import { HOME_SUGGESTION_RADIUS_KM } from '@/features/home/homeTripPriority';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { useCallback, useEffect, useMemo } from 'react';
import { displayReadOptions, useDisplayReadsEnabled, useDisplayRefetch } from '@/hooks/useDisplayReads';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeLocation } from '@/hooks/home/useHomeLocation';
type Props =
  Pick<ReturnType<typeof useHomeLocation>,
    'lastKnownLocation'
  >
  & Pick<ReturnType<typeof useHomeContext>,
    'isFocused'
    | 'storedTrips'
    | 'dispatch'
  >;
export function useHomeTripFeed({
  lastKnownLocation,
  isFocused,
  storedTrips,
  dispatch,
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
  // An empty nearby result is not a reason to download distant trips. Keep the
  // same geographic scope for the fallback endpoint when the nearby read fails.
  const useGeneral = Boolean(nearbyTripsPayload && nearby.isError);
  const general = useGetTripsQuery({ minSeats: HOME_MIN_AVAILABLE_SEATS, limit: 50,
    departureCoordinates: nearbyTripsPayload?.departureCoordinates ?? undefined,
    departureRadiusKm: HOME_SUGGESTION_RADIUS_KM, sort: 'date' }, {
    ...displayReadOptions(enabled && useGeneral, HOME_PASSIVE_LIST_POLL_MS),
  });
  // Only fall back after the nearby response; never download both full feeds on mount.
  const remoteTrips = useGeneral ? general.currentData : nearby.currentData;
  const selected = useGeneral ? general : nearby;
  const tripsLoading = Boolean(nearbyTripsPayload && selected.isFetching && !remoteTrips?.length && storedTrips.length === 0);
  const tripsError = Boolean(nearbyTripsPayload && selected.isError && !remoteTrips?.length && storedTrips.length === 0);
  const refetchNearby = useDisplayRefetch(enabled && Boolean(nearbyTripsPayload) && !nearby.isUninitialized,
    JSON.stringify(nearbyTripsPayload), nearby.refetch);
  const refetchGeneral = useDisplayRefetch(enabled && useGeneral && !general.isUninitialized,
    JSON.stringify(nearbyTripsPayload), general.refetch);
  const generalUninitialized = general.isUninitialized;
  const refetchTrips = useCallback(async () => {
    if (!enabled) return;
    if (nearbyTripsPayload) {
      const result = await refetchNearby();
      if (result.error && !generalUninitialized) return refetchGeneral();
      return result;
    }
    if (!generalUninitialized) return refetchGeneral();
  }, [enabled, nearbyTripsPayload, refetchNearby, refetchGeneral, generalUninitialized]);

  useEffect(() => {
    if (remoteTrips) {
      dispatch(setTrips(remoteTrips.filter(hasUpcomingDeparture).slice(0, 50)));
    }
  }, [remoteTrips, dispatch]);

  const showInitialHomeLoader = tripsLoading && !remoteTrips && storedTrips.length === 0;
  return {
    remoteTrips,
    discoveryUpdatedAt: selected.fulfilledTimeStamp,
    tripsLoading,
    tripsError,
    refetchTrips,
    showInitialHomeLoader,
  };
}
