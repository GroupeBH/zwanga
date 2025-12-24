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
 * Get route coordinates between two points using Mapbox Directions API
 * Falls back to straight line if API fails or token is not configured
 */
export async function getRouteCoordinates(
  origin: LatLng,
  destination: LatLng,
): Promise<LatLng[]> {
  const routeInfo = await getRouteInfo(origin, destination);
  return routeInfo.coordinates;
}

/**
 * Get complete route information (coordinates, duration, distance) using Mapbox Directions API
 * Falls back to straight line if API fails or token is not configured
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
    // Get Mapbox access token from environment variables
    const extra = Constants.expoConfig?.extra || {};
    const accessToken = 
      extra.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || 
      process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

    if (!accessToken) {
      console.warn('Mapbox access token not configured. Using straight line.');
      // Fallback: calculate approximate distance and duration
      const distance = approximateDistanceKm * 1000; // Convert to meters
      const estimatedDuration = (distance / 1000) * 60; // Rough estimate: 1km = 1 minute
      return {
        coordinates: [origin, destination],
        duration: estimatedDuration,
        distance: distance,
      };
    }

    // Mapbox Directions API v5
    // Format: [longitude, latitude] for coordinates
    // Assurer que les coordonnées sont bien formatées
    const originLng = Number(origin.longitude.toFixed(6));
    const originLat = Number(origin.latitude.toFixed(6));
    const destLng = Number(destination.longitude.toFixed(6));
    const destLat = Number(destination.latitude.toFixed(6));

    const coordinates = `${originLng},${originLat};${destLng},${destLat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&overview=full&access_token=${accessToken}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      let errorMessage = '';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorText;
      } catch {
        errorMessage = errorText;
      }
      
      // Si l'erreur est due à la limite de distance, utiliser le calcul direct sans logger
      if (errorMessage.includes('maximum distance limitation') || errorMessage.includes('exceeds maximum distance')) {
        const distance = approximateDistanceKm * 1000;
        const estimatedDuration = (distance / 1000) * 60;
        return {
          coordinates: [origin, destination],
          duration: estimatedDuration,
          distance: distance,
        };
      }
      
      // Pour les autres erreurs, logger uniquement si ce n'est pas une erreur 422
      if (response.status !== 422) {
        console.warn(`Mapbox Directions API failed: ${response.status} - ${errorMessage}`);
      }
      throw new Error(`Mapbox Directions API failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.code === 'Ok' && data.routes?.[0]) {
      const route = data.routes[0];
      // Mapbox returns coordinates as [longitude, latitude] arrays
      const coordinates = route.geometry?.coordinates as [number, number][] || [];
      const routeCoordinates = coordinates.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));

      return {
        coordinates: routeCoordinates.length > 0 ? routeCoordinates : [origin, destination],
        duration: route.duration || 0, // Duration in seconds
        distance: route.distance || 0, // Distance in meters
      };
    }

    if (data.code === 'NoRoute') {
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

    throw new Error(`Mapbox Directions API error: ${data.code} - ${data.message || 'Unknown error'}`);
  } catch (error: any) {
    // Ne logger que les erreurs non-422 (unprocessable entity) et non liées à la distance pour éviter le spam
    // Les erreurs 422 sont généralement dues à des coordonnées invalides ou distance trop longue, ce qui est déjà géré
    const errorMessage = error?.message || '';
    if (errorMessage && 
        !errorMessage.includes('422') && 
        !errorMessage.includes('maximum distance limitation') &&
        !errorMessage.includes('exceeds maximum distance')) {
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

