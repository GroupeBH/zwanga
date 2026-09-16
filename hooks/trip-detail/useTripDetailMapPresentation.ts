import {
  TRIP_DETAIL_MAP_MIN_DELTA,
  TRIP_DETAIL_MAP_MAX_DELTA,
  TRIP_DETAIL_MAP_PADDING,
  DEFAULT_MAP_REGION,
  isValidMapCoordinate,
} from '../../features/trip-detail/tripDetailModel';
import type { Booking } from '@/types';
import { getRouteInfo, type RouteInfo } from '@/utils/routeApi';
import { splitRouteByProgress } from '@/utils/routeHelpers';
import React, { useEffect, useMemo } from 'react';
import type { Trip } from '@/types';
import type { MapCoordinate } from '@/utils/tripCoordinates';
import { getRouteStopLabel } from '@/utils/routeLocationLabels';

interface Params {
  trip: Trip | undefined;
  progress: number;
  departureCoordinate: { latitude: number; longitude: number; };
  arrivalCoordinate: MapCoordinate;
  liveDriverCoordinate: { latitude: number; longitude: number; } | null;
  routeCoordinates: { latitude: number; longitude: number; }[] | null;
  hasValidRouteEndpoints: boolean;
  tripBookings: Booking[] | undefined;
  routeInfo: RouteInfo | null;
  setEstimatedArrivalTime: React.Dispatch<React.SetStateAction<Date | null>>;
}

export function useTripDetailMapPresentation({
  trip,
  progress,
  departureCoordinate,
  arrivalCoordinate,
  liveDriverCoordinate,
  routeCoordinates,
  hasValidRouteEndpoints,
  tripBookings,
  routeInfo,
  setEstimatedArrivalTime,
}: Params) {
  const estimatedCoordinate = useMemo(() => {
    if (!trip || trip.status !== 'ongoing' || typeof progress !== 'number') {
      return null;
    }
    const ratio = Math.min(Math.max(progress, 0), 100) / 100;
    return {
      latitude: departureCoordinate.latitude + (arrivalCoordinate.latitude - departureCoordinate.latitude) * ratio,
      longitude:
        departureCoordinate.longitude + (arrivalCoordinate.longitude - departureCoordinate.longitude) * ratio,
    };
  }, [arrivalCoordinate, departureCoordinate, progress, trip?.status]);

  // Calculate current coordinate for ETA calculation
  const currentCoordinate = liveDriverCoordinate ?? estimatedCoordinate;

  // Split route into traveled and remaining portions when trip is ongoing
  const routeSplit = useMemo(() => {
    if (!routeCoordinates || routeCoordinates.length < 2 || trip?.status !== 'ongoing' || !currentCoordinate) {
      return {
        traveledCoordinates: [],
        remainingCoordinates: routeCoordinates || [],
      };
    }
    return splitRouteByProgress(currentCoordinate, routeCoordinates);
  }, [routeCoordinates, trip?.status, currentCoordinate]);

  const routeMapCoordinates = useMemo(() => {
    const validRouteCoordinates = (routeCoordinates ?? []).filter(isValidMapCoordinate);
    if (validRouteCoordinates.length >= 2) {
      return validRouteCoordinates;
    }
    return hasValidRouteEndpoints ? [departureCoordinate, arrivalCoordinate] : [];
  }, [arrivalCoordinate, departureCoordinate, hasValidRouteEndpoints, routeCoordinates]);

  const hasDetailedRouteMapCoordinates = (routeCoordinates ?? []).filter(isValidMapCoordinate).length >= 2;

  const passengerDestinationMarkers = useMemo(() => {
    const markers: {
      id: string;
      coordinate: { latitude: number; longitude: number };
      title: string;
      description: string;
    }[] = [];

    tripBookings
      ?.filter((booking) => booking.status === 'accepted' && booking.passengerDestinationCoordinates)
      .forEach((booking) => {
        const destination = booking.passengerDestinationCoordinates;
        const coordinate = {
          latitude: Number(destination?.latitude),
          longitude: Number(destination?.longitude),
        };
        if (!isValidMapCoordinate(coordinate)) {
          return;
        }
        markers.push({
          id: String(booking.id),
          coordinate,
          title: getRouteStopLabel({ address: booking.passengerDestination }, 'Destination passager').title,
          description: booking.passengerName || 'Passager',
        });
      });

    return markers;
  }, [tripBookings]);

  // Calculate estimated arrival time based on current position
  useEffect(() => {
    if (!trip || !routeInfo || trip.status !== 'ongoing' || !currentCoordinate) {
      setEstimatedArrivalTime(null);
      return;
    }

    let timeoutId: NodeJS.Timeout;
    let isMounted = true;

    const calculateETA = () => {
      // Calculate remaining route from current position to destination
      getRouteInfo(currentCoordinate, arrivalCoordinate)
        .then((remainingRouteInfo) => {
          if (!isMounted) return;
          const remainingDurationSeconds = remainingRouteInfo.duration;
          const estimatedArrival = new Date(Date.now() + remainingDurationSeconds * 1000);
          setEstimatedArrivalTime(estimatedArrival);
        })
        .catch(() => {
          if (!isMounted) return;
          // Fallback: use progress to estimate remaining time
          if (routeInfo.duration > 0 && typeof progress === 'number') {
            const remainingProgress = (100 - Math.min(Math.max(progress, 0), 100)) / 100;
            const remainingDurationSeconds = routeInfo.duration * remainingProgress;
            const estimatedArrival = new Date(Date.now() + remainingDurationSeconds * 1000);
            setEstimatedArrivalTime(estimatedArrival);
          } else {
            setEstimatedArrivalTime(null);
          }
        });
    };

    // Debounce: wait 5 seconds after position change before calculating
    timeoutId = setTimeout(calculateETA, 5000);

    // Also calculate immediately if this is the first time
    calculateETA();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [trip?.status, routeInfo, currentCoordinate, arrivalCoordinate, progress]);

  const mapRegion = useMemo(() => {
    if (!hasValidRouteEndpoints) {
      return DEFAULT_MAP_REGION;
    }
    const routeFocusCoordinate =
      routeMapCoordinates.length > 2
        ? routeMapCoordinates[Math.floor(routeMapCoordinates.length / 2)]
        : null;
    const latitudeCenter =
      routeFocusCoordinate?.latitude ?? (departureCoordinate.latitude + arrivalCoordinate.latitude) / 2;
    const longitudeCenter =
      routeFocusCoordinate?.longitude ?? (departureCoordinate.longitude + arrivalCoordinate.longitude) / 2;
    const rawLatitudeDelta =
      Math.abs(departureCoordinate.latitude - arrivalCoordinate.latitude) * TRIP_DETAIL_MAP_PADDING;
    const rawLongitudeDelta =
      Math.abs(departureCoordinate.longitude - arrivalCoordinate.longitude) * TRIP_DETAIL_MAP_PADDING;
    const latitudeDelta = Math.min(
      Math.max(rawLatitudeDelta, TRIP_DETAIL_MAP_MIN_DELTA),
      TRIP_DETAIL_MAP_MAX_DELTA,
    );
    const longitudeDelta = Math.min(
      Math.max(rawLongitudeDelta, TRIP_DETAIL_MAP_MIN_DELTA),
      TRIP_DETAIL_MAP_MAX_DELTA,
    );

    return {
      latitude: latitudeCenter,
      longitude: longitudeCenter,
      latitudeDelta,
      longitudeDelta,
    };
  }, [arrivalCoordinate, departureCoordinate, hasValidRouteEndpoints, routeMapCoordinates]);

  return {
    mapRegion,
    routeMapCoordinates,
    hasDetailedRouteMapCoordinates,
    passengerDestinationMarkers,
  };
}
