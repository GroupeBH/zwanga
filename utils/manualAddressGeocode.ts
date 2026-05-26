import type { MapLocationSelection } from '@/components/LocationPickerModal';
import type { GeocodeResponse } from '@/store/api/googleMapsApi';

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

  return {
    title: trimmedAddress,
    address: response.formattedAddress?.trim() || trimmedAddress,
    latitude: response.lat,
    longitude: response.lng,
  };
}
