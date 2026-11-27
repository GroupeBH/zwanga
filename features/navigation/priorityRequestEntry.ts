import type { TripRequest } from '@/types';
import type { RideAlert } from '@/features/notifications/rideAlert';
import { isRequestUnassigned, isTripRequestWithinAcceptanceWindow } from '@/features/trip-request/requestExpiration';
import { isSelfDriverAlert } from '@/features/notifications/requestOwnership';

// Explicit detail links, forms, chat, payment and navigation keep their own flow.
export function canResumeRequestFromPath(path: string) {
  return ['/', '/(tabs)', '/trips', '/profile', '/discover', '/requests', '/my-requests', '/search', '/explore', '/notifications'].includes(path);
}

export function isOwnWaitingRequest(request: TripRequest, userId: string) {
  // Direct acceptance can create an upcoming trip immediately. Its presence
  // alone does not mean that the ride has started; entry verifies that trip.
  const awaitingStart = request.status === 'driver_selected' && !!request.selectedDriverId;
  return request.passengerId === userId && (isRequestUnassigned(request) || awaitingStart) && isTripRequestWithinAcceptanceWindow(request);
}

export function selectWaitingRequest(requests: readonly TripRequest[], userId: string, excluded: Set<string>) {
  return requests.filter(request => !excluded.has(request.id) && isOwnWaitingRequest(request, userId))
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || a.id.localeCompare(b.id))[0];
}

export function selectRequestAlert(alerts: readonly RideAlert[], userId: string, excluded: Set<string>) {
  return alerts.find(alert => alert.recipientId === userId && !excluded.has(alert.key) &&
    !isSelfDriverAlert(alert.data, userId) &&
    (alert.kind === 'nearby' || alert.kind === 'dispatch') &&
    (!alert.expiresAt || Date.parse(alert.expiresAt) > Date.now()));
}
