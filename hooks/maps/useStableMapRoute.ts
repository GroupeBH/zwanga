import { useMemo, useRef } from 'react';
import type { LatLng } from 'react-native-maps';
import { boundedRoutePoints, isValidRoutePoint, MAX_DECODED_ROUTE_POINTS } from '@/utils/routes/safePolyline';

/** Keep equivalent REST/socket geometry from crossing the native bridge again. */
export function useStableMapRoute(coordinates: LatLng[], preserveGeometry = false) {
  const safe = useMemo(() => preserveGeometry
    ? coordinates.length >= 2 && coordinates.length <= MAX_DECODED_ROUTE_POINTS && coordinates.every(isValidRoutePoint) ? coordinates : []
    : boundedRoutePoints(coordinates), [coordinates, preserveGeometry]);
  const previous = useRef(safe);
  if (previous.current.length !== safe.length || safe.some((point, index) =>
    point.latitude !== previous.current[index].latitude || point.longitude !== previous.current[index].longitude)) {
    previous.current = safe;
  }
  return previous.current;
}
