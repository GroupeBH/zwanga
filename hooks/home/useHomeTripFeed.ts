import { hasUpcomingDeparture, HOME_MIN_AVAILABLE_SEATS, HOME_PASSIVE_LIST_POLL_MS, roundCoordinate } from '@/features/home/homeModel';
import {
  type TripSearchByPointsPayload,
  useGetTripsByCoordinatesQuery,
  useGetTripsQuery
} from '@/store/api/tripApi';
import { setTrips } from '@/store/slices/tripsSlice';
import { useCallback, useEffect, useMemo } from 'react';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeLocation } from '@/hooks/home/useHomeLocation';
type Props =
  Pick<ReturnType<typeof useHomeLocation>,
    'lastKnownLocation'
  >
  & Pick<ReturnType<typeof useHomeContext>,
    'locationRadiusKm'
    | 'isFocused'
    | 'storedTrips'
    | 'dispatch'
  >;
export function useHomeTripFeed({
  lastKnownLocation,
  locationRadiusKm,
  isFocused,
  storedTrips,
  dispatch,
}: Props) {
  const latitude = lastKnownLocation?.coords?.latitude;
  const longitude = lastKnownLocation?.coords?.longitude;
  const roundedLatitude = typeof latitude === 'number' && Number.isFinite(latitude) ? roundCoordinate(latitude) : null;
  const roundedLongitude = typeof longitude === 'number' && Number.isFinite(longitude) ? roundCoordinate(longitude) : null;
  const nearbyTripsPayload = useMemo<TripSearchByPointsPayload | null>(() => {
    if (roundedLatitude === null || roundedLongitude === null) {
      return null;
    }

    return {
      departureCoordinates: [
        roundedLongitude,
        roundedLatitude,
      ],
      departureRadiusKm: locationRadiusKm,
      minSeats: HOME_MIN_AVAILABLE_SEATS,
    };
  }, [
    roundedLatitude,
    roundedLongitude,
    locationRadiusKm,
  ]);

  const nearby = useGetTripsByCoordinatesQuery(
    nearbyTripsPayload ?? { departureCoordinates: [0, 0], minSeats: HOME_MIN_AVAILABLE_SEATS },
    { skip: !isFocused || !nearbyTripsPayload,
      pollingInterval: isFocused ? HOME_PASSIVE_LIST_POLL_MS : 0,
      skipPollingIfUnfocused: true, refetchOnFocus: isFocused, refetchOnReconnect: false },
  );
  const useGeneral = !nearbyTripsPayload || nearby.isError || nearby.currentData?.length === 0;
  const general = useGetTripsQuery({ minSeats: HOME_MIN_AVAILABLE_SEATS, limit: 50 }, {
    skip: !isFocused || !useGeneral,
    pollingInterval: isFocused && useGeneral ? HOME_PASSIVE_LIST_POLL_MS : 0,
    skipPollingIfUnfocused: true, refetchOnFocus: isFocused, refetchOnReconnect: false,
  });
  // Only fall back after the nearby response; never download both full feeds on mount.
  const remoteTrips = useGeneral ? general.currentData : nearby.currentData;
  const selected = useGeneral ? general : nearby;
  const tripsLoading = selected.isFetching && !remoteTrips?.length && storedTrips.length === 0;
  const tripsError = selected.isError && !remoteTrips?.length && storedTrips.length === 0;
  const refetchNearby = nearby.refetch;
  const refetchGeneral = general.refetch;
  const generalUninitialized = general.isUninitialized;
  const refetchTrips = useCallback(async () => {
    if (!isFocused) return;
    if (nearbyTripsPayload) {
      const result = await refetchNearby();
      if ((result.isError || !result.data?.length) && !generalUninitialized) return refetchGeneral();
      return result;
    }
    if (!generalUninitialized) return refetchGeneral();
  }, [isFocused, nearbyTripsPayload, refetchNearby, refetchGeneral, generalUninitialized]);

  useEffect(() => {
    if (remoteTrips) {
      dispatch(setTrips(remoteTrips.filter(hasUpcomingDeparture).slice(0, 50)));
    }
  }, [remoteTrips, dispatch]);

  const showInitialHomeLoader = tripsLoading && !remoteTrips && storedTrips.length === 0;
  return {
    remoteTrips,
    tripsLoading,
    tripsError,
    refetchTrips,
    showInitialHomeLoader,
  };
}
