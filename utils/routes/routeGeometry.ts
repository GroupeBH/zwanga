import { LatLng } from './routeTypes';

/**
 * Calculate distance between two points in kilometers (Haversine formula)
 */
export function calculateDistance(point1: LatLng, point2: LatLng): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const dLon = ((point2.longitude - point1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.latitude * Math.PI) / 180) *
      Math.cos((point2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate distance between a point and a line segment in kilometers
 * Uses the perpendicular distance formula
 */
export function pointToLineDistance(point: LatLng, lineStart: LatLng, lineEnd: LatLng): number {
  const A = point.latitude - lineStart.latitude;
  const B = point.longitude - lineStart.longitude;
  const C = lineEnd.latitude - lineStart.latitude;
  const D = lineEnd.longitude - lineStart.longitude;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx: number;
  let yy: number;

  if (param < 0) {
    xx = lineStart.latitude;
    yy = lineStart.longitude;
  } else if (param > 1) {
    xx = lineEnd.latitude;
    yy = lineEnd.longitude;
  } else {
    xx = lineStart.latitude + param * C;
    yy = lineStart.longitude + param * D;
  }

  const dx = point.latitude - xx;
  const dy = point.longitude - yy;
  return calculateDistance(point, { latitude: xx, longitude: yy });
}

/**
 * Check if a point is on a route (within a certain distance threshold)
 * @param point The point to check
 * @param routeCoordinates Array of coordinates representing the route
 * @param maxDistanceKm Maximum distance in kilometers from the route (default: 5km)
 * @returns true if the point is on the route, false otherwise
 */
export function isPointOnRoute(
  point: LatLng,
  routeCoordinates: LatLng[],
  maxDistanceKm: number = 5
): boolean {
  if (!routeCoordinates || routeCoordinates.length < 2) {
    return false;
  }

  // Check distance to each segment of the route
  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const segmentStart = routeCoordinates[i];
    const segmentEnd = routeCoordinates[i + 1];
    
    const distance = pointToLineDistance(point, segmentStart, segmentEnd);
    
    if (distance <= maxDistanceKm) {
      return true;
    }
  }

  return false;
}

/**
 * Find the closest point on a route to a given point
 * @param point The point to find the closest route point for
 * @param routeCoordinates Array of coordinates representing the route
 * @returns The index of the closest segment and the closest point on that segment, or null if route is invalid
 */
export function findClosestPointOnRoute(
  point: LatLng,
  routeCoordinates: LatLng[]
): { segmentIndex: number; closestPoint: LatLng; distance: number } | null {
  if (!routeCoordinates || routeCoordinates.length < 2) {
    return null;
  }

  let minDistance = Infinity;
  let closestSegmentIndex = 0;
  let closestPoint: LatLng = routeCoordinates[0];

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const segmentStart = routeCoordinates[i];
    const segmentEnd = routeCoordinates[i + 1];
    
    const distance = pointToLineDistance(point, segmentStart, segmentEnd);
    
    if (distance < minDistance) {
      minDistance = distance;
      closestSegmentIndex = i;
      
      // Calculate the closest point on the segment
      const A = point.latitude - segmentStart.latitude;
      const B = point.longitude - segmentStart.longitude;
      const C = segmentEnd.latitude - segmentStart.latitude;
      const D = segmentEnd.longitude - segmentStart.longitude;
      
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = lenSq !== 0 ? dot / lenSq : 0;
      
      // Clamp param to [0, 1]
      param = Math.max(0, Math.min(1, param));
      
      closestPoint = {
        latitude: segmentStart.latitude + param * C,
        longitude: segmentStart.longitude + param * D,
      };
    }
  }

  return {
    segmentIndex: closestSegmentIndex,
    closestPoint,
    distance: minDistance,
  };
}

export function getRouteAlignedPosition(
  point: LatLng,
  routeCoordinates: LatLng[],
  maxDistanceKm = 0.08,
): { coordinate: LatLng; heading: number; distance: number } | null {
  const closest = findClosestPointOnRoute(point, routeCoordinates);
  if (!closest || closest.distance > maxDistanceKm) {
    return null;
  }

  const segmentStart = routeCoordinates[closest.segmentIndex];
  const segmentEnd = routeCoordinates[closest.segmentIndex + 1];
  if (!segmentStart || !segmentEnd) {
    return null;
  }

  const startLatitude = (segmentStart.latitude * Math.PI) / 180;
  const endLatitude = (segmentEnd.latitude * Math.PI) / 180;
  const longitudeDelta = ((segmentEnd.longitude - segmentStart.longitude) * Math.PI) / 180;
  const y = Math.sin(longitudeDelta) * Math.cos(endLatitude);
  const x =
    Math.cos(startLatitude) * Math.sin(endLatitude) -
    Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(longitudeDelta);
  const heading = (Math.atan2(y, x) * 180) / Math.PI;

  return {
    coordinate: closest.closestPoint,
    heading: (heading + 360) % 360,
    distance: closest.distance,
  };
}

/**
 * Split route coordinates into traveled and remaining portions based on current position
 * @param currentPosition Current position of the driver
 * @param routeCoordinates Full route coordinates
 * @returns Object with traveledCoordinates and remainingCoordinates arrays
 */
export function splitRouteByProgress(
  currentPosition: LatLng | null,
  routeCoordinates: LatLng[]
): { traveledCoordinates: LatLng[]; remainingCoordinates: LatLng[] } {
  if (!routeCoordinates || routeCoordinates.length < 2) {
    return {
      traveledCoordinates: [],
      remainingCoordinates: routeCoordinates || [],
    };
  }

  // If no current position, return empty traveled and full remaining
  if (!currentPosition) {
    return {
      traveledCoordinates: [],
      remainingCoordinates: routeCoordinates,
    };
  }

  const closest = findClosestPointOnRoute(currentPosition, routeCoordinates);
  
  if (!closest) {
    return {
      traveledCoordinates: [],
      remainingCoordinates: routeCoordinates,
    };
  }

  // If the closest point is at the start, return empty traveled
  if (closest.segmentIndex === 0 && closest.distance > 0.1) {
    // Check if we're actually before the start
    const startDistance = calculateDistance(currentPosition, routeCoordinates[0]);
    if (startDistance > 0.1) {
      return {
        traveledCoordinates: [],
        remainingCoordinates: routeCoordinates,
      };
    }
  }

  // Build traveled coordinates: from start to closest point
  const traveledCoordinates: LatLng[] = [];
  
  // Add all coordinates up to the segment
  for (let i = 0; i <= closest.segmentIndex; i++) {
    traveledCoordinates.push(routeCoordinates[i]);
  }
  
  // Add the closest point on the current segment
  traveledCoordinates.push(closest.closestPoint);

  // Build remaining coordinates: from closest point to end
  const remainingCoordinates: LatLng[] = [closest.closestPoint];
  
  // Add all coordinates after the segment
  for (let i = closest.segmentIndex + 1; i < routeCoordinates.length; i++) {
    remainingCoordinates.push(routeCoordinates[i]);
  }

  return {
    traveledCoordinates,
    remainingCoordinates,
  };
}
