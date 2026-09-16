import type { MapLocationSelection } from '@/components/LocationPickerModal';
import type { GeocodeResponse } from '@/store/api/googleMapsApi';
import {
  isCoordinateInKinshasaBounds,
  normalizeTripMapCoordinate,
} from '@/utils/tripCoordinates';

export type ManualGeocodeStatus = 'idle' | 'searching' | 'found' | 'missing';

export const MANUAL_GEOCODE_DEBOUNCE_MS = 650;

const LOCATION_CONTEXT_PATTERN = /\b(kinshasa|rdc|drc|congo|zaire)\b/i;

export function buildManualGeocodeQuery(address: string) {
  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    return '';
  }

  return LOCATION_CONTEXT_PATTERN.test(trimmedAddress)
    ? trimmedAddress
    : `${trimmedAddress}, Kinshasa, RDC`;
}

export function mapGeocodeResponseToSelection(
  address: string,
  response?: GeocodeResponse,
): MapLocationSelection | null {
  const trimmedAddress = address.trim();
  if (
    !trimmedAddress ||
    !response ||
    !Number.isFinite(response.lat) ||
    !Number.isFinite(response.lng)
  ) {
    return null;
  }

  const coordinate = normalizeTripMapCoordinate(response.lat, response.lng);
  if (!coordinate) {
    return null;
  }
  const expectsKinshasaCoordinate =
    /\bkinshasa\b/i.test(trimmedAddress) || !LOCATION_CONTEXT_PATTERN.test(trimmedAddress);
  if (expectsKinshasaCoordinate && !isCoordinateInKinshasaBounds(coordinate)) {
    return null;
  }

  return {
    title: trimmedAddress,
    address: response.formattedAddress?.trim() || trimmedAddress,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  };
}
