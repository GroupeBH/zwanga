import { readableLocation, UNKNOWN_LOCATION_ADDRESS } from '@/utils/readableLocation';

export type PickerCoordinate = { latitude: number; longitude: number };
export type MapLocationSelection = PickerCoordinate & { title: string; address: string };
export const DEFAULT_PICKER_LOCATION: MapLocationSelection = {
  title: 'Kinshasa', address: 'Kinshasa, RDC', latitude: -4.441931, longitude: 15.266293,
};

export function getPickerCoordinate(latitude: number, longitude: number): PickerCoordinate | null {
  const inBounds = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -13.5 && lat <= 5.4 && lng >= 12 && lng <= 31.3;
  if (inBounds(latitude, longitude)) return { latitude, longitude };
  // Preserve support for historical places whose lat/lng were stored in reverse order.
  if (inBounds(longitude, latitude)) return { latitude: longitude, longitude: latitude };
  return null;
}

export const samePickerPoint = (a: PickerCoordinate, b: PickerCoordinate) =>
  Math.abs(a.latitude - b.latitude) < 0.0001 && Math.abs(a.longitude - b.longitude) < 0.0001;

export function pointSelection(point: PickerCoordinate, title = 'Point sélectionné'): MapLocationSelection {
  return { ...point, title, address: UNKNOWN_LOCATION_ADDRESS };
}

export function readableSelection(value: MapLocationSelection): MapLocationSelection {
  return { ...value, ...readableLocation({ name: value.title, formattedAddress: value.address }) };
}

/** Only the rendered line is sampled. Snapping always uses the complete validated route. */
export function pickerDisplayRoute(route: PickerCoordinate[], limit = 400): PickerCoordinate[] {
  if (route.length <= limit) return route;
  return Array.from({ length: limit }, (_, index) => route[Math.round(index * (route.length - 1) / (limit - 1))]);
}
