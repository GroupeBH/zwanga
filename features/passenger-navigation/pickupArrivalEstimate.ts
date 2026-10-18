import type { Booking, Trip } from '@/types';
import type { PassengerRouteInfo } from './navigationModel';

export const PICKUP_LOCATION_MAX_AGE_MS = 120_000;
export const PICKUP_ROUTE_MAX_AGE_MS = 180_000;
export const PICKUP_ROUTE_REFRESH_MS = 60_000;

export type PickupArrivalEstimate = {
  status: 'scheduled' | 'paused' | 'offline' | 'waiting_location' | 'stale' | 'calculating' | 'unavailable' | 'estimated';
  value: string;
  detail: string;
};

export function isAwaitingPassengerPickup(booking: Booking | undefined, trip: Trip | undefined) {
  return Boolean(booking && trip && booking.tripId === trip.id && booking.status === 'accepted' &&
    !booking.pickedUp && !booking.pickedUpConfirmedByPassenger && !booking.pickedUpAt &&
    !booking.droppedOff && !booking.droppedOffConfirmedByPassenger && !booking.droppedOffAt &&
    trip.status !== 'completed' && trip.status !== 'cancelled');
}

export function isFreshPickupLocation(timestamp: number | undefined, now: number) {
  return typeof timestamp === 'number' && Number.isFinite(timestamp) &&
    now - timestamp >= -30_000 && now - timestamp < PICKUP_LOCATION_MAX_AGE_MS;
}

type Params = {
  booking: Booking | undefined;
  trip: Trip | undefined;
  online: boolean;
  hasDriverLocation: boolean;
  locationTimestamp: number | undefined;
  routeInfo: PassengerRouteInfo | null;
  routeSignature: string;
  remainingDistanceMeters: number | null;
  isRouteUsable: boolean;
  loading: boolean;
  now: number;
};

/** A road estimate, never a boarding confirmation or a countdown from a stale GPS fix. */
export function getPickupArrivalEstimate(params: Params): PickupArrivalEstimate | null {
  const { booking, trip, online, hasDriverLocation, locationTimestamp, routeInfo,
    routeSignature, remainingDistanceMeters, isRouteUsable, loading, now } = params;
  if (!isAwaitingPassengerPickup(booking, trip)) return null;
  if (!online) return { status: 'offline', value: 'Hors connexion', detail: 'Reconnectez-vous pour connaître le délai d’arrivée.' };
  if (trip?.interruptionRequest?.status === 'confirmed') {
    return { status: 'paused', value: 'Trajet en pause', detail: 'L’estimation sera actualisée à la reprise du trajet.' };
  }
  if (trip?.status !== 'ongoing') {
    return { status: 'scheduled', value: 'En attente du départ', detail: 'Le délai s’affichera quand le conducteur démarrera et partagera sa position.' };
  }
  if (!hasDriverLocation || locationTimestamp === undefined) {
    return { status: 'waiting_location', value: 'Position en attente', detail: 'En attente de la position du conducteur pour estimer son arrivée.' };
  }
  if (!isFreshPickupLocation(locationTimestamp, now)) {
    return { status: 'stale', value: 'Position à actualiser', detail: 'La dernière position ne permet plus d’estimer un délai fiable.' };
  }
  const hasRoadEstimate = routeInfo?.routeSignature === routeSignature &&
    typeof routeInfo.fetchedAt === 'number' && now - routeInfo.fetchedAt >= 0 &&
    now - routeInfo.fetchedAt < PICKUP_ROUTE_MAX_AGE_MS &&
    Number.isFinite(routeInfo.distanceMeters) && routeInfo.distanceMeters > 0 &&
    Number.isFinite(routeInfo.durationSeconds) && routeInfo.durationSeconds > 0 &&
    isRouteUsable && typeof remainingDistanceMeters === 'number' &&
    Number.isFinite(remainingDistanceMeters) && remainingDistanceMeters >= 0 &&
    remainingDistanceMeters <= routeInfo.distanceMeters * 1.2;
  if (!hasRoadEstimate || !routeInfo || remainingDistanceMeters === null) {
    return loading
      ? { status: 'calculating', value: 'Calcul en cours…', detail: 'Estimation jusqu’à votre point de prise en charge.' }
      : { status: 'unavailable', value: 'Estimation indisponible', detail: 'Le délai sera actualisé dès qu’un itinéraire fiable sera disponible.' };
  }
  const seconds = routeInfo.durationSeconds * Math.min(1, remainingDistanceMeters / routeInfo.distanceMeters);
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const duration = minutes < 60 ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  return {
    status: 'estimated', value: seconds < 60 ? 'Moins d’une minute' : `Environ ${duration}`,
    detail: 'Jusqu’au point de prise en charge. Le délai peut varier selon la circulation et les arrêts.',
  };
}
