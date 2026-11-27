import { isValidMapCoordinate } from '../../features/trip-detail/tripDetailModel';
import { getRouteInfo, type RouteInfo } from '@/utils/routeApi';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Trip } from '@/types';

interface Params {
  isScreenActive: boolean;
  trip: Trip | undefined;
  setRouteCoordinates: React.Dispatch<React.SetStateAction<{ latitude: number; longitude: number; }[] | null>>;
  setRouteInfo: React.Dispatch<React.SetStateAction<RouteInfo | null>>;
  setCalculatedArrivalTime: React.Dispatch<React.SetStateAction<Date | null>>;
  setIsLoadingRoute: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useTripDetailRouteCoordinates({
  isScreenActive,
  trip,
  setRouteCoordinates,
  setRouteInfo,
  setCalculatedArrivalTime,
  setIsLoadingRoute,
}: Params) {
  const tripId = trip?.id;
  const departureTime = trip?.departureTime;
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<{ key: string; status: 'loading' | 'ready' | 'unavailable' } | null>(null);
  const retryAt = useRef(0);
  const retryRoute = useCallback(() => {
    if (Date.now() - retryAt.current < 3000) return;
    retryAt.current = Date.now();
    setAttempt(value => value + 1);
  }, []);
  const departureCoordinate = useMemo(
    () => {
      const coordinate = normalizeTripMapCoordinate(trip?.departure?.lat, trip?.departure?.lng);
      if (!coordinate) {
        return { latitude: 0, longitude: 0 };
      }
      return coordinate;
    },
    [trip?.departure?.lat, trip?.departure?.lng],
  );

  const arrivalCoordinate = useMemo(
    () => {
      const coordinate = normalizeTripMapCoordinate(trip?.arrival?.lat, trip?.arrival?.lng);
      if (!coordinate) {
        return { latitude: 0, longitude: 0 };
      }
      return coordinate;
    },
    [trip?.arrival?.lat, trip?.arrival?.lng],
  );

  useEffect(() => {
    if (!trip?.id) {
      return;
    }

    console.log('[TripDetails] route endpoint coordinates', {
      tripId: trip?.id,
      departure: {
        raw: {
          lat: trip?.departure?.lat,
          lng: trip?.departure?.lng,
          hasCoordinates: trip?.departure?.hasCoordinates,
        },
        normalized: departureCoordinate,
      },
      arrival: {
        raw: {
          lat: trip?.arrival?.lat,
          lng: trip?.arrival?.lng,
          hasCoordinates: trip?.arrival?.hasCoordinates,
        },
        normalized: arrivalCoordinate,
      },
    });
  }, [
    arrivalCoordinate,
    departureCoordinate,
    trip?.arrival?.hasCoordinates,
    trip?.arrival?.lat,
    trip?.arrival?.lng,
    trip?.departure?.hasCoordinates,
    trip?.departure?.lat,
    trip?.departure?.lng,
    trip?.id,
  ]);

  const hasValidRouteEndpoints = useMemo(
    () => Boolean(trip && trip.departure?.hasCoordinates !== false && trip.arrival?.hasCoordinates !== false &&
      isValidMapCoordinate(departureCoordinate) && isValidMapCoordinate(arrivalCoordinate)),
    [arrivalCoordinate, departureCoordinate, trip],
  );
  const key = `${tripId}:${departureCoordinate.latitude}:${departureCoordinate.longitude}:${arrivalCoordinate.latitude}:${arrivalCoordinate.longitude}:${attempt}`;

  // Load route coordinates and info when trip changes
  useEffect(() => {
    if (!isScreenActive) return;
    if (!tripId || !hasValidRouteEndpoints) {
      setRead({ key, status: 'unavailable' });
      setRouteCoordinates(null);
      setRouteInfo(null);
      setCalculatedArrivalTime(null);
      setIsLoadingRoute(false);
      return;
    }
    setIsLoadingRoute(true);
    setRead({ key, status: 'loading' });
    setRouteCoordinates(null);
    setRouteInfo(null);
    setCalculatedArrivalTime(null);
    let cancelled = false;
    getRouteInfo(departureCoordinate, arrivalCoordinate, { requireDetailedRoute: true })
      .then((info) => {
        if (cancelled) return;
        if (info.geometry !== 'detailed' || info.coordinates.length < 2) {
          setRead({ key, status: 'unavailable' });
          setIsLoadingRoute(false);
          return;
        }
        setRouteCoordinates(info.coordinates);
        setRouteInfo(info);
        setRead({ key, status: 'ready' });

        // Calculate arrival time based on departure time + route duration
        if (info.duration > 0 && departureTime) {
          const departureDate = new Date(departureTime);
          const arrivalDate = new Date(departureDate.getTime() + info.duration * 1000);
          setCalculatedArrivalTime(arrivalDate);
        } else {
          setCalculatedArrivalTime(null);
        }

        setIsLoadingRoute(false);
      })
      .catch(() => {
        if (cancelled) return;
        // No straight-line substitute: booking stops must follow the server's road route.
        setRouteCoordinates(null);
        setRead({ key, status: 'unavailable' });
        setRouteInfo(null);
        setCalculatedArrivalTime(null);
        setIsLoadingRoute(false);
      });
    return () => { cancelled = true; };
  }, [isScreenActive, departureCoordinate, arrivalCoordinate, hasValidRouteEndpoints, tripId, departureTime, key,
    setRouteCoordinates, setRouteInfo, setCalculatedArrivalTime, setIsLoadingRoute]);

  return {
    departureCoordinate,
    arrivalCoordinate,
    hasValidRouteEndpoints,
    routeStatus: read?.key === key ? read.status : 'loading' as const,
    retryRoute,
  };
}
