import { Colors } from '@/constants/styles';
import type { HomeAutoProgressEvent, LivePassengerLocation, MapCoordinate } from '@/features/home/homeTypes';
import type { Booking, Trip, TripRequest } from '@/types';
import { isFreshLocationTimestamp } from '@/utils/navigation/routeProgress';
import {
  getGeoPointCoordinate as getSafeGeoPointCoordinate,
  getTripLocationCoordinate,
  isCoordinateInKinshasaBounds
} from '@/utils/tripCoordinates';
import { Ionicons } from '@expo/vector-icons';
export const RECENT_TRIPS_LIMIT = 10;

export const HOME_MIN_AVAILABLE_SEATS = 1;

export const HOME_ACTIVE_TRIP_POLL_MS = 30_000;

export const HOME_ACTIVE_BOOKINGS_POLL_MS = 30_000;

export const HOME_ACTIVITY_POLL_MS = 60_000;

export const HOME_PASSIVE_LIST_POLL_MS = 120_000;

export const DRIVER_UPCOMING_TRIP_HIGHLIGHT_WINDOW_MS = 3 * 60 * 60 * 1000;

export const UNACCEPTED_TRIP_REQUEST_EXPIRATION_MS = 12 * 60 * 60 * 1000;

export const HOME_COLORS = {
  ink: '#07112A',
  text: '#111318',
  body: '#4B2D28',
  rust: '#B92A00',
  rustDark: '#982300',
  navy: '#304B77',
  navySoft: '#DCE7FF',
  surface: '#F7F8FA',
  line: '#E8D6CF',
  softLine: '#E8EBEF',
  success: '#0EAD65',
};

export const vehicleLabel: Record<Trip['vehicleType'], string> = {
  car: 'Voiture',
  moto: 'Moto',
  tricycle: 'Keke',
};

export const vehicleIcon: Record<Trip['vehicleType'], keyof typeof Ionicons.glyphMap> = {
  car: 'car-sport-outline',
  moto: 'bicycle-outline',
  tricycle: 'bus-outline',
};

export const tripRequestStatusMeta: Record<
  TripRequest['status'],
  { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  pending: { label: 'Nouvelle demande', color: Colors.warning, bg: Colors.warning + '16', icon: 'radio-outline' },
  offers_received: { label: 'Offres en cours', color: Colors.info, bg: Colors.info + '16', icon: 'sparkles-outline' },
  driver_selected: { label: 'Attribuée', color: Colors.success, bg: Colors.success + '16', icon: 'checkmark-circle-outline' },
  cancelled: { label: 'Annulée', color: Colors.danger, bg: Colors.danger + '16', icon: 'close-circle-outline' },
  expired: { label: 'Expirée', color: Colors.gray[500], bg: Colors.gray[200], icon: 'time-outline' },
};

export const isTripRequestWithinAcceptanceWindow = (
  request: TripRequest,
  now = Date.now(),
) => {
  const hasAcceptedDriver =
    request.status === 'driver_selected' ||
    Boolean(request.selectedDriverId) ||
    Boolean(request.tripId) ||
    Boolean(request.offers?.some((offer) => offer.status === 'accepted'));

  if (hasAcceptedDriver) {
    return true;
  }

  if (request.status !== 'pending' && request.status !== 'offers_received') {
    return false;
  }

  const latestAcceptedDepartureAt = new Date(request.departureDateMax).getTime();
  return (
    Number.isFinite(latestAcceptedDepartureAt) &&
    latestAcceptedDepartureAt + UNACCEPTED_TRIP_REQUEST_EXPIRATION_MS > now
  );
};

export const bookingStatusMeta: Record<
  Booking['status'],
  { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  pending: { label: 'Nouvelle réservation', color: Colors.warning, bg: Colors.warning + '16', icon: 'ticket-outline' },
  accepted: { label: 'Réservation acceptée', color: Colors.success, bg: Colors.success + '16', icon: 'checkmark-circle-outline' },
  rejected: { label: 'Réservation refusée', color: Colors.danger, bg: Colors.danger + '16', icon: 'close-circle-outline' },
  cancelled: { label: 'Réservation annulée', color: Colors.danger, bg: Colors.danger + '16', icon: 'close-circle-outline' },
  completed: { label: 'Réservation terminée', color: Colors.success, bg: Colors.success + '16', icon: 'flag-outline' },
  no_show: { label: 'Passager non embarqué', color: Colors.info, bg: Colors.info + '16', icon: 'person-remove-outline' },
  expired: { label: 'Réservation expirée', color: Colors.gray[500], bg: Colors.gray[200], icon: 'time-outline' },
  boarding_uncertain: { label: 'Embarquement non confirmé', color: Colors.warning, bg: Colors.warning + '16', icon: 'help-circle-outline' },
};

export const HOME_AUTO_PROGRESS_PRIORITY: Record<HomeAutoProgressEvent['type'], number> = {
  driver_near_pickup: 0,
  driver_arrived_pickup: 1,
  parties_nearby: 2,
  passenger_ready_pickup: 3,
  pickup_confirmed: 4,
  passenger_no_show: 5,
  passenger_boarding_uncertain: 6,
  passenger_near_destination: 7,
  dropoff_confirmed: 8,
  driver_near_destination: 9,
  driver_arrived_destination: 10,
};

export const EMPTY_HOME_TRIPS: Trip[] = [];

export const EMPTY_HOME_BOOKINGS: Booking[] = [];

export const EMPTY_HOME_TRIP_REQUESTS: TripRequest[] = [];

export function isFreshLivePassengerLocation(location?: LivePassengerLocation | null) {
  if (!location) {
    return false;
  }

  if (!location.updatedAt) {
    return true;
  }

  return isFreshLocationTimestamp(new Date(location.updatedAt).getTime());
}

export function hasFreshBookingPassengerLocation(booking: Booking) {
  if (!booking.passengerLocationUpdatedAt) {
    return false;
  }

  return isFreshLocationTimestamp(new Date(booking.passengerLocationUpdatedAt).getTime());
}

export function formatPrice(price?: number | null) {
  const safePrice = Number(price ?? 0);

  if (!Number.isFinite(safePrice) || safePrice <= 0) {
    return 'Gratuit';
  }

  return `${String(Math.round(safePrice)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} FC`;
}

export function getInitials(name?: string | null) {
  if (!name) {
    return 'ZW';
  }

  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function placeName(place?: Trip['departure'] | TripRequest['departure']) {
  return place?.name || place?.address || 'Adresse à préciser';
}

export function getTripRequestStatusMeta(status: TripRequest['status']) {
  return tripRequestStatusMeta[status] ?? tripRequestStatusMeta.pending;
}

export function getBookingStatusMeta(status: Booking['status']) {
  return bookingStatusMeta[status] ?? bookingStatusMeta.pending;
}

export function getLocationCoordinate(location?: Trip['departure']): MapCoordinate | null {
  return getTripLocationCoordinate(location);
}

export function getGeoPointCoordinate(point?: Trip['currentLocation']): MapCoordinate | null {
  return getSafeGeoPointCoordinate(point);
}

export function isKinshasaHomeTrip(trip?: Trip | null) {
  const departureCoordinate = trip ? getLocationCoordinate(trip.departure) : null;
  const arrivalCoordinate = trip ? getLocationCoordinate(trip.arrival) : null;

  return Boolean(
    departureCoordinate &&
    arrivalCoordinate &&
    isCoordinateInKinshasaBounds(departureCoordinate) &&
    isCoordinateInKinshasaBounds(arrivalCoordinate),
  );
}

export function isCoordinateAllowedForHomeTrip(
  coordinate: MapCoordinate | null | undefined,
  trip?: Trip | null,
): coordinate is MapCoordinate {
  return Boolean(
    coordinate && (!isKinshasaHomeTrip(trip) || isCoordinateInKinshasaBounds(coordinate)),
  );
}

export function getTripMapCoordinate(
  trip: Trip,
  liveCoordinate?: MapCoordinate | null,
): MapCoordinate | null {
  const departureCoordinate = getLocationCoordinate(trip.departure);

  if (liveCoordinate && isCoordinateAllowedForHomeTrip(liveCoordinate, trip)) {
    return liveCoordinate;
  }

  if (trip.status === 'ongoing') {
    const currentLocationCoordinate = getGeoPointCoordinate(trip.currentLocation);

    return isCoordinateAllowedForHomeTrip(currentLocationCoordinate, trip)
      ? currentLocationCoordinate
      : departureCoordinate;
  }

  return departureCoordinate;
}

export function hasUpcomingDeparture(trip: Pick<Trip, 'departureTime' | 'status'>) {
  if (trip.status === 'ongoing') {
    return true;
  }

  const departureTs = new Date(trip.departureTime).getTime();

  if (!Number.isFinite(departureTs)) {
    return false;
  }

  return departureTs >= Date.now();
}

export function roundCoordinate(value: number) {
  return Number(value.toFixed(5));
}
