import {
  TRIP_DETAIL_MAP_MIN_DELTA,
  TRIP_DETAIL_MAP_PADDING,
  DEFAULT_MAP_REGION,
  isValidMapCoordinate,
} from '../../features/trip-detail/tripDetailModel';
import type { Booking } from '@/types';
import type { RouteInfo } from '@/utils/routeApi';
import { useTripDetailArrivalEstimate } from './useTripDetailArrivalEstimate';
import { splitRouteByProgress } from '@/utils/routes/routeGeometry';
import React, { useMemo } from 'react';
import type { Trip } from '@/types';
import type { MapCoordinate } from '@/utils/tripCoordinates';
import { getRouteStopLabel } from '@/utils/routeLocationLabels';
import { boundedRoutePoints, routeBounds } from '@/utils/routes/safePolyline';

interface Params {
  isScreenActive: boolean;
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
  isScreenActive,
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
    const validRouteCoordinates = boundedRoutePoints(routeCoordinates);
    if (validRouteCoordinates.length >= 2) {
      return validRouteCoordinates;
    }
    return hasValidRouteEndpoints ? [departureCoordinate, arrivalCoordinate] : [];
  }, [arrivalCoordinate, departureCoordinate, hasValidRouteEndpoints, routeCoordinates]);

  // Two points are the shared route API's offline/failed-calculation fallback.
  const hasDetailedRouteMapCoordinates = routeMapCoordinates.length > 2;

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

  useTripDetailArrivalEstimate({
    enabled: isScreenActive && trip?.status === 'ongoing', tripId: trip?.id,
    origin: currentCoordinate, destination: arrivalCoordinate,
    duration: routeInfo?.duration, progress, onEstimate: setEstimatedArrivalTime,
  });

  const mapRegion = useMemo(() => {
    if (!hasValidRouteEndpoints) {
      return DEFAULT_MAP_REGION;
    }
    const bounds = routeBounds([departureCoordinate, ...routeMapCoordinates, arrivalCoordinate]);
    if (!bounds) return DEFAULT_MAP_REGION;
    const padding = Math.max(1.6, TRIP_DETAIL_MAP_PADDING);
    return {
      latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
      longitude: (bounds.minLongitude + bounds.maxLongitude) / 2,
      latitudeDelta: Math.min(180, Math.max(TRIP_DETAIL_MAP_MIN_DELTA, (bounds.maxLatitude - bounds.minLatitude) * padding)),
      longitudeDelta: Math.min(360, Math.max(TRIP_DETAIL_MAP_MIN_DELTA, (bounds.maxLongitude - bounds.minLongitude) * padding)),
    };
  }, [arrivalCoordinate, departureCoordinate, hasValidRouteEndpoints, routeMapCoordinates]);

  return {
    mapRegion,
    routeMapCoordinates,
    hasDetailedRouteMapCoordinates,
    passengerDestinationMarkers,
  };
}
