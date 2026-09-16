import type { Href, Router } from 'expo-router';
import type { User } from '@/types';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';

type NotificationData = Record<string, any>;

function normalizeData(data: NotificationData): NotificationData {
  return { ...data?.data, ...data };
}

function getId(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    const id = String(value).trim();
    if (id && /^[a-zA-Z0-9_-]+$/.test(id)) return id;
  }
  return null;
}

function getType(data: NotificationData): string {
  return typeof data.type === 'string' ? data.type.toLowerCase().replace(/-/g, '_') : '';
}

function isTripRequestType(type: string): boolean {
  // An interruption request belongs to a TRIP, not to /trip-requests/:id.
  return !type.includes('interruption') && (
    type === 'trip_request' || type.startsWith('trip_request_') || type === 'new_trip_request' ||
    type === 'driver_offer' || type === 'offer_accepted'
  );
}

export const extractTripRequestId = (input: NotificationData): string | null => {
  const data = normalizeData(input);
  const explicitId = getId(data.tripRequestId, data.trip_request_id, data.tripRequest?.id, data.trip_request?.id);
  if (explicitId) return explicitId;
  // Legacy notifications used requestId. Never mistake an emergency's requestId for it.
  const type = getType(data);
  return !type || isTripRequestType(type) ? getId(data.requestId) : null;
};

export const isUserDriverOfTrip = (input: NotificationData, currentUser: User | undefined): boolean => {
  const data = normalizeData(input);
  if (data.role === 'passenger') return false;
  if (data.role === 'driver') return true;
  const driverId = getId(data.driverId, data.trip?.driverId, data.trip?.driver?.id);
  return Boolean(currentUser?.id && driverId === String(currentUser.id));
};

export const isDriverNotification = (type: string): boolean => [
  'trip_expiring',
  'driver_reminder',
  'booking_pending',
  'trip_starting_soon',
  'driver_trip_revenue',
  'driver_booking_earning_confirmed',
].includes(type);

export const getTripUrl = (
  tripId: string,
  input: NotificationData,
  currentUser: User | undefined,
  type?: string,
): `/trip/${string}` | `/trip/manage/${string}` => {
  const data = normalizeData(input);
  // The recipient's role on THIS trip takes precedence over their account role.
  if (data.role === 'passenger') return `/trip/${tripId}`;
  if (isUserDriverOfTrip(data, currentUser) || (type && isDriverNotification(type))) {
    return `/trip/manage/${tripId}`;
  }
  return `/trip/${tripId}`;
};

/** Single routing policy shared by push notifications and the notification inbox. */
export function getNotificationHref(input: NotificationData, currentUser?: User): Href | null {
  const data = normalizeData(input);
  const type = getType(data);
  const tripId = getId(data.tripId, data.trip_id, data.trip?.id);
  const requestId = extractTripRequestId(data);
  const bookingId = getId(data.bookingId, data.booking?.id);
  const conversationId = getId(data.conversationId, data.conversation?.id);

  if (type === 'ride_confirmation_required') {
    if (data.role === 'passenger' && bookingId) return `/booking/navigate/${bookingId}`;
    if (data.role === 'driver' && tripId) return `/trip/navigate/${tripId}`;
  }
  if (type === 'ongoing_trip' && data.role === 'passenger' && bookingId) {
    return `/booking/navigate/${bookingId}`;
  }

  if (type === 'referral_new_referral') return '/referrals';
  if (type === 'driver_trip_revenue' || type === 'driver_booking_earning_confirmed') return '/driver-earnings';
  if ((type === 'message' || type === 'chat') && conversationId) {
    return { pathname: '/chat/[id]', params: { id: conversationId } };
  }
  if ((type === 'rate' || type === 'review') && tripId) return `/rate/${tripId}`;
  if (type === 'trip_manage' && tripId) return `/trip/manage/${tripId}`;
  if (type === 'ongoing_trip' && !tripId && typeof data.navigateTo === 'string' &&
    /^\/(trip\/(manage\/)?|booking\/navigate\/)[a-zA-Z0-9_-]+$/.test(data.navigateTo)) {
    return data.navigateTo as Href;
  }

  // Acceptance creates a real trip. Starting, pausing and emergency events must open it,
  // even if the payload also contains the original tripRequestId or an interruption ID.
  if (tripId && (type === 'trip_request_accepted' || type === 'trip_request_started' ||
    type === 'trip_request_trip_started' || !isTripRequestType(type))) {
    return getTripUrl(tripId, data, currentUser, type);
  }

  // Offers, expiration and overdue-pickup recovery still belong to the request.
  if (requestId) return getTripRequestDetailHref(requestId);
  if (tripId) return getTripUrl(tripId, data, currentUser, type);
  if (conversationId) return { pathname: '/chat/[id]', params: { id: conversationId } };
  if (bookingId) return '/bookings';
  return null;
}

export const handleNotificationNavigation = (
  data: NotificationData,
  router: Router,
  currentUser: User | undefined,
): void => {
  const href = getNotificationHref(data, currentUser);
  // Allow a dismissed notification/modal to release its native view before navigation.
  setTimeout(() => {
    try {
      if (href !== null) {
        router.push(href);
      } else {
        router.push('/(tabs)');
      }
    } catch (error) {
      console.warn('[notificationNavigation] Impossible d’ouvrir la notification:', error);
    }
  }, 100);
};

