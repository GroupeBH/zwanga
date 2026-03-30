import { store } from '@/store';
import { googleMapsApi, TravelMode } from '@/store/api/googleMapsApi';
import { calculateDistance } from '@/utils/routeHelpers';

type LatLng = { latitude: number; longitude: number };

export interface RouteInfo {
  coordinates: LatLng[];
  duration: number;
  distance: number;
}

const ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 60 * 1000;
const THROTTLE_COOLDOWN_MS = 90 * 1000;

const routeInfoCache = new Map<string, { expiresAt: number; value: RouteInfo }>();
const inFlightRouteRequests = new Map<string, Promise<RouteInfo>>();
let routeApiCooldownUntil = 0;
let lastThrottleWarningAt = 0;

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
    console.warn('[routeApi] Backend directions throttled. Using cached or straight-line fallback temporarily.');
  }
}

export async function getRouteCoordinates(origin: LatLng, destination: LatLng): Promise<LatLng[]> {
  const routeInfo = await getRouteInfo(origin, destination);
  return routeInfo.coordinates;
}

export async function getRouteInfo(origin: LatLng, destination: LatLng): Promise<RouteInfo> {
  const safeOrigin = origin ?? { latitude: 0, longitude: 0 };
  const safeDestination = destination ?? { latitude: 0, longitude: 0 };
  const cacheKey = buildRouteCacheKey(safeOrigin, safeDestination);
  const cachedRouteInfo = getCachedRouteInfo(cacheKey);
  if (cachedRouteInfo) {
    return cachedRouteInfo;
  }

  const inFlightRequest = inFlightRouteRequests.get(cacheKey);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const fallbackRouteInfo = buildFallbackRouteInfo(safeOrigin, safeDestination);

  if (
    !origin ||
    !destination ||
    typeof origin.latitude !== 'number' ||
    typeof origin.longitude !== 'number' ||
    typeof destination.latitude !== 'number' ||
    typeof destination.longitude !== 'number' ||
    Number.isNaN(origin.latitude) ||
    Number.isNaN(origin.longitude) ||
    Number.isNaN(destination.latitude) ||
    Number.isNaN(destination.longitude) ||
    !Number.isFinite(origin.latitude) ||
    !Number.isFinite(origin.longitude) ||
    !Number.isFinite(destination.latitude) ||
    !Number.isFinite(destination.longitude)
  ) {
    return fallbackRouteInfo;
  }

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
    return fallbackRouteInfo;
  }

  if (calculateDistance(origin, destination) > 800) {
    return fallbackRouteInfo;
  }

  if (routeApiCooldownUntil > Date.now()) {
    setCachedRouteInfo(cacheKey, fallbackRouteInfo, FALLBACK_CACHE_TTL_MS);
    return fallbackRouteInfo;
  }

  const routeRequest = (async () => {
    try {
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

      if (result.error || !result.data || !result.data.routes?.length) {
        if (isThrottleError(result.error)) {
          enterRouteApiCooldown();
        } else {
          console.warn('No route found from backend, using straight line:', result.error || result.data?.status);
        }

        setCachedRouteInfo(cacheKey, fallbackRouteInfo, FALLBACK_CACHE_TTL_MS);
        return fallbackRouteInfo;
      }

      const route = result.data.routes[0];
      const leg = route.legs?.[0];
      const decodedCoordinates = route.overviewPolyline
        ? decodePolyline(route.overviewPolyline).map(([lat, lng]) => ({
            latitude: lat,
            longitude: lng,
          }))
        : [];

      const routeInfo: RouteInfo = {
        coordinates: decodedCoordinates.length > 0 ? decodedCoordinates : fallbackRouteInfo.coordinates,
        duration: leg?.duration || fallbackRouteInfo.duration,
        distance: leg?.distance || fallbackRouteInfo.distance,
      };

      setCachedRouteInfo(cacheKey, routeInfo, ROUTE_CACHE_TTL_MS);
      return routeInfo;
    } catch (error) {
      if (isThrottleError(error)) {
        enterRouteApiCooldown();
      } else {
        console.warn('Failed to fetch route from backend, using straight line:', error);
      }

      setCachedRouteInfo(cacheKey, fallbackRouteInfo, FALLBACK_CACHE_TTL_MS);
      return fallbackRouteInfo;
    } finally {
      inFlightRouteRequests.delete(cacheKey);
    }
  })();

  inFlightRouteRequests.set(cacheKey, routeRequest);
  return routeRequest;
}
