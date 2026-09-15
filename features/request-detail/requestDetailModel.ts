import type { TripRequestVehicleType, VehicleType } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import type { LatLng, Region } from 'react-native-maps';

export type RequestRouteMapData = {
  arrivalCoordinate: LatLng;
  departureCoordinate: LatLng;
  fallbackCoordinates: LatLng[];
  initialRegion: Region;
};

export type RouteOverridePickerTarget =
  | 'directDeparture'
  | 'directArrival';

export const LANDMARK_PLACEHOLDER = 'Ex: devant la station, portail bleu, entr\u00E9e principale';
export const TRIP_REQUEST_VEHICLE_LABELS: Record<TripRequestVehicleType, string> = {
  car: 'Voiture',
  motorcycle_2_wheels: 'Moto à 2 roues',
  motorcycle_3_wheels: 'Moto à 3 roues',
};
export const TRIP_REQUEST_VEHICLE_ICONS: Record<
  TripRequestVehicleType,
  keyof typeof Ionicons.glyphMap
> = {
  car: 'car-sport',
  motorcycle_2_wheels: 'bicycle',
  motorcycle_3_wheels: 'car-outline',
};

export function normalizeTripRequestVehicleType(
  type?: TripRequestVehicleType | VehicleType | null,
): TripRequestVehicleType {
  switch (type) {
    case 'motorcycle_2_wheels':
    case 'moto':
      return 'motorcycle_2_wheels';
    case 'motorcycle_3_wheels':
    case 'tricycle':
      return 'motorcycle_3_wheels';
    case 'car':
    default:
      return 'car';
  }
}

export const EDIT_SCHEDULE_SUGGESTION_LEAD_MS = 5 * 60 * 1000;
export const EDIT_SCHEDULE_MIN_WINDOW_MS = 30 * 60 * 1000;

export function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function getScheduleWindowDuration(minDate: Date | null, maxDate: Date | null) {
  if (!isValidDate(minDate) || !isValidDate(maxDate)) {
    return EDIT_SCHEDULE_MIN_WINDOW_MS;
  }

  return Math.max(
    maxDate.getTime() - minDate.getTime(),
    EDIT_SCHEDULE_MIN_WINDOW_MS,
  );
}

export function getEditScheduleError(minDate: Date | null, maxDate: Date | null) {
  if (!isValidDate(minDate) || !isValidDate(maxDate)) {
    return 'Choisissez une date et une heure de d\u00e9part valides.';
  }
  if (minDate.getTime() <= Date.now()) {
    return 'L\u2019heure de d\u00e9part doit \u00eatre dans le futur.';
  }
  if (maxDate.getTime() <= minDate.getTime()) {
    return 'L\u2019heure de fin du cr\u00e9neau doit suivre l\u2019heure de d\u00e9part.';
  }

  return null;
}

export function formatCdfPrice(value: number) {
  return `${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FC`;
}
