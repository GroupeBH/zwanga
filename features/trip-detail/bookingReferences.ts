import type { MapLocationSelection } from '@/features/location-picker/locationPickerModel';
import { requiresRequestReference, requestReferenceMessage } from '@/features/trip-request/requestReference';
import { matchingReferenceLocation } from '@/features/trips/tripEditReferences';
import type { Trip } from '@/types';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';

export type BookingReferenceTarget = 'origin' | 'destination';

/** References belong to the chosen stop, never to live GPS or to a previous address. */
export function bookingReferenceContext(
  trip: Trip | undefined,
  target: BookingReferenceTarget,
  selection: MapLocationSelection | null,
  manualAddress: string,
) {
  const endpoint = target === 'origin' ? trip?.departure : trip?.arrival;
  const manual = manualAddress.trim();
  const address = (manual || selection?.title || selection?.address || endpoint?.name || endpoint?.address || '').trim();
  const endpointPoint = endpoint?.hasCoordinates === false ? null
    : normalizeTripMapCoordinate(endpoint?.lat, endpoint?.lng);
  const sameEndpoint = !manual && (!selection || Boolean(endpointPoint &&
    Math.abs(selection.latitude - endpointPoint.latitude) < 0.000001 &&
    Math.abs(selection.longitude - endpointPoint.longitude) < 0.000001));
  // A manual address owns its reference even while geocoding updates its selection.
  const key = JSON.stringify([trip?.id, target, manual ? ['manual', manual.toLowerCase()]
    : [address.toLowerCase(), selection?.latitude ?? endpoint?.lat, selection?.longitude ?? endpoint?.lng]]);
  return {
    key, address,
    required: requiresRequestReference(address, manual ? matchingReferenceLocation(manual, selection) : selection),
    inheritedReference: sameEndpoint ? endpoint?.reference?.trim() || '' : '',
  };
}

export function bookingReferenceError(
  origin: ReturnType<typeof bookingReferenceContext>, originValue: string,
  destination: ReturnType<typeof bookingReferenceContext>, destinationValue: string,
) {
  if (origin.required && !originValue.trim()) return requestReferenceMessage('departure');
  if (destination.required && !destinationValue.trim()) return requestReferenceMessage('arrival');
  if (originValue.trim().length > 200 || destinationValue.trim().length > 200) {
    return 'Limitez chaque repère à 200 caractères.';
  }
  return null;
}
