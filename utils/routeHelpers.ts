import { calculateDistance } from './routes/routeGeometry';
export { calculateDistance } from './routes/routeGeometry';
export { isPointOnRoute } from './routes/routeGeometry';
export { findClosestPointOnRoute } from './routes/routeGeometry';
export { getRouteAlignedPosition } from './routes/routeGeometry';
export { splitRouteByProgress } from './routes/routeGeometry';
import { LatLng, RouteInfo } from './routes/routeTypes';
export type { LatLng } from './routes/routeTypes';
export type { RouteInfo } from './routes/routeTypes';
/**
 * Utility functions for route calculation and display
 */

import { store } from '@/store';
import { googleMapsApi, TravelMode } from '@/store/api/googleMapsApi';

const ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 60 * 1000;
const THROTTLE_COOLDOWN_MS = 90 * 1000;

const routeInfoCache = new Map<string, { expiresAt: number; value: RouteInfo }>();
const inFlightRouteRequests = new Map<string, Promise<RouteInfo>>();
let routeApiCooldownUntil = 0;
let lastThrottleWarningAt = 0;

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

function normalizeCoordinate(value: number) {
  return Number.isFinite(value) ? value.toFixed(5) : '0.00000';
}

function buildRouteCacheKey(origin: LatLng, destination: LatLng) {
  return [
    normalizeCoordinate(origin.latitude),
    normalizeCoordinate(origin.longitude),
    normalizeCoordinate(destination.latitude),
    normalizeCoordinate(destination.longitude),
  ].join(':');
}

function buildFallbackRouteInfo(origin: LatLng, destination: LatLng): RouteInfo {
  const distance = calculateDistance(origin, destination) * 1000;
  const estimatedDuration = (distance / 1000) * 60;

  return {
    coordinates: [origin, destination],
    duration: estimatedDuration,
    distance,
  };
}

function getCachedRouteInfo(cacheKey: string) {
  const cached = routeInfoCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    routeInfoCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function setCachedRouteInfo(cacheKey: string, value: RouteInfo, ttlMs: number) {
  routeInfoCache.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    value,
  });
}

function isThrottleError(errorLike: unknown) {
  if (!errorLike || typeof errorLike !== 'object') {
    return false;
  }

  const candidate = errorLike as {
    status?: number | string;
    data?: { statusCode?: number; message?: string };
    error?: string;
  };

  if (candidate.status === 429 || candidate.data?.statusCode === 429) {
    return true;
  }

  const message = `${candidate.data?.message ?? ''} ${candidate.error ?? ''}`.toLowerCase();
  return message.includes('too many requests') || message.includes('throttlerexception');
}

function enterRouteApiCooldown() {
  routeApiCooldownUntil = Date.now() + THROTTLE_COOLDOWN_MS;

  if (Date.now() - lastThrottleWarningAt > THROTTLE_COOLDOWN_MS / 2) {
    lastThrottleWarningAt = Date.now();
    console.warn('[routeHelpers] Backend directions throttled. Using cached or straight-line fallback temporarily.');
  }
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
    // Utiliser le backend pour obtenir les directions
    const result = await store.dispatch(
      googleMapsApi.endpoints.getDirections.initiate({
        origin: {
          lat: origin.latitude,
          lng: origin.longitude,
        },
        destination: {
          lat: destination.latitude,
          lng: destination.longitude,
        },
        mode: TravelMode.DRIVING,
        alternatives: false,
      })
    );

    if (result.error || !result.data || !result.data.routes || result.data.routes.length === 0) {
      console.warn('No route found from backend, using straight line:', result.error || result.data?.status);
      // Fallback: calculate approximate distance and duration
      const distance = approximateDistanceKm * 1000;
      const estimatedDuration = (distance / 1000) * 60;
      return {
        coordinates: [origin, destination],
        duration: estimatedDuration,
        distance: distance,
      };
    }

    const route = result.data.routes[0];
    const leg = route.legs?.[0];
    
    // Décoder la polyline encodée de Google Maps
    let routeCoordinates: LatLng[] = [];
    if (route.overviewPolyline) {
      const decoded = decodePolyline(route.overviewPolyline);
      routeCoordinates = decoded.map(([lat, lng]) => ({
        latitude: lat,
        longitude: lng,
      }));
    }

    return {
      coordinates: routeCoordinates.length > 0 ? routeCoordinates : [origin, destination],
      duration: leg?.duration || 0, // Duration in seconds
      distance: leg?.distance || 0, // Distance in meters
    };
  } catch (error: any) {
    const errorMessage = error?.message || '';
    if (errorMessage) {
      console.warn('Failed to fetch route from backend, using straight line:', errorMessage);
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

