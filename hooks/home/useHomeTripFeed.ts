import { hasUpcomingDeparture, HOME_MIN_AVAILABLE_SEATS, HOME_PASSIVE_LIST_POLL_MS, roundCoordinate } from '@/features/home/homeModel';
import {
  type TripSearchByPointsPayload,
  useGetTripsByCoordinatesQuery,
  useGetTripsQuery
} from '@/store/api/tripApi';
import { setTrips } from '@/store/slices/tripsSlice';
import type { Trip } from '@/types';
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

  const {
    data: generalTrips,
    isLoading: generalTripsLoading,
    isError: generalTripsError,
    refetch: refetchGeneralTrips,
  } = useGetTripsQuery(
    { minSeats: HOME_MIN_AVAILABLE_SEATS },
    {
      pollingInterval: isFocused ? HOME_PASSIVE_LIST_POLL_MS : 0,
      skipPollingIfUnfocused: true,
      refetchOnFocus: isFocused,
      refetchOnReconnect: false,
    },
  );

  const {
    data: nearbyTrips,
    isLoading: nearbyTripsLoading,
    isError: nearbyTripsError,
    refetch: refetchNearbyTrips,
  } = useGetTripsByCoordinatesQuery(
    nearbyTripsPayload ?? {
      departureCoordinates: [0, 0] as [number, number],
      minSeats: HOME_MIN_AVAILABLE_SEATS,
    },
    {
      skip: !isFocused || !nearbyTripsPayload,
      pollingInterval: isFocused ? HOME_PASSIVE_LIST_POLL_MS : 0,
      skipPollingIfUnfocused: true,
      refetchOnFocus: isFocused,
      refetchOnReconnect: false,
    },
  );

  const remoteTrips = useMemo(() => {
    if (!nearbyTripsPayload) {
      return generalTrips;
    }

    if (!nearbyTrips?.length && !generalTrips) {
      return undefined;
    }

    const tripsById = new Map<string, Trip>();

    (nearbyTrips ?? []).forEach((trip) => {
      tripsById.set(trip.id, trip);
    });

    (generalTrips ?? []).forEach((trip) => {
      if (!tripsById.has(trip.id)) {
        tripsById.set(trip.id, trip);
      }
    });

    return Array.from(tripsById.values());
  }, [nearbyTripsPayload, nearbyTrips, generalTrips]);

  const tripsLoading = nearbyTripsPayload
    ? (nearbyTripsLoading || generalTripsLoading) && !remoteTrips?.length && storedTrips.length === 0
    : generalTripsLoading && !generalTrips && storedTrips.length === 0;

  const tripsError = nearbyTripsPayload
    ? nearbyTripsError && generalTripsError && !remoteTrips?.length && storedTrips.length === 0
    : generalTripsError && !generalTrips && storedTrips.length === 0;

  const refetchTrips = useCallback(() => {
    if (!isFocused) return;
    if (nearbyTripsPayload) {
      void refetchNearbyTrips();
    }

    return refetchGeneralTrips();
  }, [isFocused, nearbyTripsPayload, refetchNearbyTrips, refetchGeneralTrips]);

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
