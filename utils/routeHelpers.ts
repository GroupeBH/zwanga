/**
 * Utility functions for route calculation and display
 */

import Constants from 'expo-constants';

type LatLng = { latitude: number; longitude: number };

export interface RouteInfo {
  coordinates: LatLng[];
  duration: number; // Duration in seconds
  distance: number; // Distance in meters
}

/**
 * Décode une polyline encodée de Google Maps
 */
function decodePolyline(encoded: string): [number, number][] {
  const poly: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push([lat * 1e-5, lng * 1e-5]);
  }

  return poly;
}

/**
 * Get route coordinates between two points using Google Maps Directions API
 * Falls back to straight line if API fails or key is not configured
 */
export async function getRouteCoordinates(
  origin: LatLng,
  destination: LatLng,
): Promise<LatLng[]> {
  const routeInfo = await getRouteInfo(origin, destination);
  return routeInfo.coordinates;
}

/**
 * Get complete route information (coordinates, duration, distance) using Google Maps Directions API
 * Falls back to straight line if API fails or key is not configured
 */
export async function getRouteInfo(
  origin: LatLng,
  destination: LatLng,
): Promise<RouteInfo> {
  // Valider les coordonnées d'entrée
  if (
    !origin ||
    !destination ||
    typeof origin.latitude !== 'number' ||
    typeof origin.longitude !== 'number' ||
    typeof destination.latitude !== 'number' ||
    typeof destination.longitude !== 'number' ||
    isNaN(origin.latitude) ||
    isNaN(origin.longitude) ||
    isNaN(destination.latitude) ||
    isNaN(destination.longitude) ||
    !isFinite(origin.latitude) ||
    !isFinite(origin.longitude) ||
    !isFinite(destination.latitude) ||
    !isFinite(destination.longitude)
  ) {
    console.warn('Invalid coordinates provided to getRouteInfo, using straight line.');
    const distance = calculateDistance(origin || { latitude: 0, longitude: 0 }, destination || { latitude: 0, longitude: 0 }) * 1000;
    const estimatedDuration = (distance / 1000) * 60;
    return {
      coordinates: [origin || { latitude: 0, longitude: 0 }, destination || { latitude: 0, longitude: 0 }],
      duration: estimatedDuration,
      distance: distance,
    };
  }

  // Valider que les coordonnées sont dans des limites raisonnables
  if (
    origin.latitude < -90 ||
    origin.latitude > 90 ||
    origin.longitude < -180 ||
    origin.longitude > 180 ||
    destination.latitude < -90 ||
    destination.latitude > 90 ||
    destination.longitude < -180 ||
    destination.longitude > 180
  ) {
    console.warn('Coordinates out of valid range, using straight line.');
    const distance = calculateDistance(origin, destination) * 1000;
    const estimatedDuration = (distance / 1000) * 60;
    return {
      coordinates: [origin, destination],
      duration: estimatedDuration,
      distance: distance,
    };
  }

  // Calculer la distance approximative avant d'appeler l'API
  // Mapbox Directions API a une limite de distance (généralement ~1000 km pour le plan gratuit)
  const approximateDistanceKm = calculateDistance(origin, destination);
  const MAX_DISTANCE_KM = 800; // Limite de sécurité (800 km pour éviter les erreurs)

  // Si la distance dépasse la limite, utiliser directement le calcul sans appeler l'API
  if (approximateDistanceKm > MAX_DISTANCE_KM) {
    const distance = approximateDistanceKm * 1000; // Convert to meters
    const estimatedDuration = (distance / 1000) * 60; // Rough estimate: 1km = 1 minute
    return {
      coordinates: [origin, destination],
      duration: estimatedDuration,
      distance: distance,
    };
  }

  try {
    // Get Google Maps API key from environment variables
    const extra = Constants.expoConfig?.extra || {};
    const apiKey = 
      extra.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.warn('Google Maps API key not configured. Using straight line.');
      // Fallback: calculate approximate distance and duration
      const distance = approximateDistanceKm * 1000; // Convert to meters
      const estimatedDuration = (distance / 1000) * 60; // Rough estimate: 1km = 1 minute
      return {
        coordinates: [origin, destination],
        duration: estimatedDuration,
        distance: distance,
      };
    }

    // Google Maps Directions API
    // Format: latitude,longitude for coordinates
    const originStr = `${origin.latitude},${origin.longitude}`;
    const destinationStr = `${destination.latitude},${destination.longitude}`;
    
    const url = `https://maps.googleapis.com/maps/api/directions/json?` +
      `origin=${originStr}&` +
      `destination=${destinationStr}&` +
      `key=${apiKey}&` +
      `mode=driving&` +
      `alternatives=false`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.warn(`Google Maps Directions API failed: ${response.status} - ${errorText}`);
      // Fallback: calculate approximate distance and duration
      const distance = approximateDistanceKm * 1000;
      const estimatedDuration = (distance / 1000) * 60;
      return {
        coordinates: [origin, destination],
        duration: estimatedDuration,
        distance: distance,
      };
    }

    const data = await response.json();

    if (data.status === 'OK' && data.routes?.[0]) {
      const route = data.routes[0];
      const leg = route.legs?.[0];
      
      // Décoder la polyline encodée de Google Maps
      let routeCoordinates: LatLng[] = [];
      if (route.overview_polyline?.points) {
        const decoded = decodePolyline(route.overview_polyline.points);
        routeCoordinates = decoded.map(([lat, lng]) => ({
          latitude: lat,
          longitude: lng,
        }));
      }

      return {
        coordinates: routeCoordinates.length > 0 ? routeCoordinates : [origin, destination],
        duration: leg?.duration?.value || 0, // Duration in seconds
        distance: leg?.distance?.value || 0, // Distance in meters
      };
    }

    if (data.status === 'ZERO_RESULTS' || data.status === 'NOT_FOUND') {
      console.warn('No route found between points. Using straight line.');
      // Fallback: calculate approximate distance and duration
      const distance = calculateDistance(origin, destination) * 1000;
      const estimatedDuration = (distance / 1000) * 60;
      return {
        coordinates: [origin, destination],
        duration: estimatedDuration,
        distance: distance,
      };
    }

    console.warn(`Google Maps Directions API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
    // Fallback: calculate approximate distance and duration
    const distance = approximateDistanceKm * 1000;
    const estimatedDuration = (distance / 1000) * 60;
    return {
      coordinates: [origin, destination],
      duration: estimatedDuration,
      distance: distance,
    };
  } catch (error: any) {
    const errorMessage = error?.message || '';
    if (errorMessage) {
      console.warn('Failed to fetch route, using straight line:', errorMessage);
    }
    // Fallback: calculate approximate distance and duration
    const distance = approximateDistanceKm * 1000;
    const estimatedDuration = (distance / 1000) * 60;
    return {
      coordinates: [origin, destination],
      duration: estimatedDuration,
      distance: distance,
    };
  }
}

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
function pointToLineDistance(point: LatLng, lineStart: LatLng, lineEnd: LatLng): number {
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
function findClosestPointOnRoute(
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

