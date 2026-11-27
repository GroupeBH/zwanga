import { store } from '@/store';
import { googleMapsApi, TravelMode } from '@/store/api/googleMapsApi';
import { calculateDistance } from '@/utils/routeHelpers';
import { BoundedCache } from '@/utils/boundedCache';
import { decodeSafePolyline } from '@/utils/routes/safePolyline';
import { bookingRouteCoordinates } from '@/utils/routes/bookingRouteGeometry';

type LatLng = { latitude: number; longitude: number };

export interface RouteInfo {
  coordinates: LatLng[];
  duration: number;
  distance: number;
  geometry?: 'detailed' | 'overview' | 'fallback';
}

const ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 60 * 1000;
const THROTTLE_COOLDOWN_MS = 90 * 1000;
const SOFT_TIMEOUT_COOLDOWN_MS = 30 * 1000;
const ROUTE_REQUEST_SOFT_TIMEOUT_MS = 4_500;

const routeInfoCache = new BoundedCache<RouteInfo>(64);
const inFlightRouteRequests = new Map<string, Promise<RouteInfo>>();
let routeApiCooldownUntil = 0;
let lastThrottleWarningAt = 0;

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
    geometry: 'fallback',
  };
}

function getCachedRouteInfo(cacheKey: string) {
  return routeInfoCache.get(cacheKey) ?? null;
}

function setCachedRouteInfo(cacheKey: string, value: RouteInfo, ttlMs: number) {
  routeInfoCache.set(cacheKey, value, ttlMs);
}

/** Immediate cached/fallback preview while a scheduled precise read is pending. */
export function getLocalRouteInfo(origin: LatLng, destination: LatLng): RouteInfo {
  return getCachedRouteInfo(buildRouteCacheKey(origin, destination)) ?? buildFallbackRouteInfo(origin, destination);
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

function isAbortLikeError(errorLike: unknown) {
  if (!errorLike || typeof errorLike !== 'object') {
    return false;
  }

  const candidate = errorLike as {
    error?: string;
    message?: string;
    name?: string;
    status?: string | number;
  };
  const errorText = `${candidate.name ?? ''} ${candidate.message ?? ''} ${candidate.error ?? ''} ${String(candidate.status ?? '')}`.toLowerCase();
  return errorText.includes('abort') || errorText.includes('cancel');
}

function enterRouteApiCooldown() {
  routeApiCooldownUntil = Date.now() + THROTTLE_COOLDOWN_MS;

  if (Date.now() - lastThrottleWarningAt > THROTTLE_COOLDOWN_MS / 2) {
    lastThrottleWarningAt = Date.now();
    console.warn('[routeApi] Backend directions throttled. Using cached or straight-line fallback temporarily.');
  }
}

function enterRouteApiSoftCooldown() {
  routeApiCooldownUntil = Math.max(routeApiCooldownUntil, Date.now() + SOFT_TIMEOUT_COOLDOWN_MS);
}

export async function getRouteCoordinates(origin: LatLng, destination: LatLng): Promise<LatLng[]> {
  const routeInfo = await getRouteInfo(origin, destination);
  return routeInfo.coordinates;
}

export async function getRouteInfo(origin: LatLng, destination: LatLng, options: { requireDetailedRoute?: boolean } = {}): Promise<RouteInfo> {
  const detailed = options.requireDetailedRoute === true;
  const safeOrigin = origin ?? { latitude: 0, longitude: 0 };
  const safeDestination = destination ?? { latitude: 0, longitude: 0 };
  const cacheKey = `${detailed ? 'booking:' : ''}${buildRouteCacheKey(safeOrigin, safeDestination)}`;
  const cachedRouteInfo = getCachedRouteInfo(cacheKey);
  if (cachedRouteInfo) {
    return cachedRouteInfo;
  }

  const inFlightRequest = inFlightRouteRequests.get(cacheKey);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  // A straight line is not an itinerary on which a passenger can choose a stop.
  const fallbackRouteInfo: RouteInfo = detailed
    ? { coordinates: [], duration: 0, distance: 0, geometry: 'fallback' }
    : buildFallbackRouteInfo(safeOrigin, safeDestination);

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
    if (!detailed) setCachedRouteInfo(cacheKey, fallbackRouteInfo, FALLBACK_CACHE_TTL_MS);
    return fallbackRouteInfo;
  }

  const routeRequest = (async () => {
    let didSoftTimeout = false;
    const request = store.dispatch(
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
      }),
    );
    const softTimeout = setTimeout(() => {
      didSoftTimeout = true;
      request.abort();
    }, detailed ? 6_000 : ROUTE_REQUEST_SOFT_TIMEOUT_MS);

    try {
      const result = await request;

      if (result.error || !result.data || !result.data.routes?.length) {
        if (isThrottleError(result.error)) {
          enterRouteApiCooldown();
        } else if (didSoftTimeout || isAbortLikeError(result.error)) {
          enterRouteApiSoftCooldown();
          // The route polyline is secondary UI. Keep the form responsive and
          // avoid noisy "aborted" logs when the mobile network is unstable.
        } else {
          console.warn(detailed ? 'Booking road route unavailable:' : 'No route found from backend, using straight line:', result.error || result.data?.status);
        }

        if (!detailed) setCachedRouteInfo(cacheKey, fallbackRouteInfo, FALLBACK_CACHE_TTL_MS);
        return fallbackRouteInfo;
      }

      const route = result.data.routes[0];
      const leg = route.legs?.[0];
      const decodedCoordinates = detailed ? bookingRouteCoordinates(route) : decodeSafePolyline(route.overviewPolyline);
      if (detailed && decodedCoordinates.length < 2) return fallbackRouteInfo;

      const routeInfo: RouteInfo = {
        coordinates: decodedCoordinates.length > 0 ? decodedCoordinates : fallbackRouteInfo.coordinates,
        duration: leg?.duration || fallbackRouteInfo.duration,
        distance: leg?.distance || fallbackRouteInfo.distance,
        geometry: detailed ? 'detailed' : decodedCoordinates.length >= 2 ? 'overview' : 'fallback',
      };

      setCachedRouteInfo(cacheKey, routeInfo, ROUTE_CACHE_TTL_MS);
      return routeInfo;
    } catch (error) {
      if (isThrottleError(error)) {
        enterRouteApiCooldown();
      } else if (didSoftTimeout || isAbortLikeError(error)) {
        enterRouteApiSoftCooldown();
        // Silent fallback: route drawing must not block forms or overload weak devices.
      } else {
        console.warn(detailed ? 'Failed to fetch booking road route:' : 'Failed to fetch route from backend, using straight line:', error);
      }

      if (!detailed) setCachedRouteInfo(cacheKey, fallbackRouteInfo, FALLBACK_CACHE_TTL_MS);
      return fallbackRouteInfo;
    } finally {
      clearTimeout(softTimeout);
      request.reset();
      inFlightRouteRequests.delete(cacheKey);
    }
  })();

  inFlightRouteRequests.set(cacheKey, routeRequest);
  return routeRequest;
}
