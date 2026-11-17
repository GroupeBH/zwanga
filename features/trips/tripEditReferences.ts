import type { MapLocationSelection } from '@/features/location-picker/locationPickerModel';
import { missingRequestReference, requestReferenceMessage } from '@/features/trip-request/requestReference';

// A newly typed address must not inherit place types from the previous selection.
export function matchingReferenceLocation(address: string, selection?: MapLocationSelection | null) {
  const normalized = address.trim().toLowerCase();
  return normalized && [selection?.title, selection?.address].some(label => label?.trim().toLowerCase() === normalized)
    ? selection : undefined;
}

export function getTripEditReferenceError(
  references: { departureReference: string; arrivalReference: string },
  departureAddress: string,
  arrivalAddress: string,
  departureSelection?: MapLocationSelection | null,
  arrivalSelection?: MapLocationSelection | null,
) {
  if (missingRequestReference(departureAddress, references.departureReference, matchingReferenceLocation(departureAddress, departureSelection))) {
    return requestReferenceMessage('departure');
  }
  if (missingRequestReference(arrivalAddress, references.arrivalReference, matchingReferenceLocation(arrivalAddress, arrivalSelection))) {
    return requestReferenceMessage('arrival');
  }
  return null;
}
