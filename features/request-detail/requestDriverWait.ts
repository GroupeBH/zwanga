import type { Booking, Trip, TripRequest } from '@/types';
import { canChangeRequestDriver } from './requestDriverChangePolicy';

export const REQUEST_DRIVER_WAIT_MS = 15 * 60_000;

/** An advisory only: never expires a trip or assumes the driver is physically absent. */
export function requestDriverWaitDeadline(request: TripRequest | undefined, userId: string | undefined,
  booking?: Booking, trip?: Trip): number | null {
  if (request?.immediateDispatch !== true || !canChangeRequestDriver(request, userId, booking, trip)) return null;
  // Without the linked reservation we cannot rule out boarding or payment.
  if (request.tripId && (!booking || !trip)) return null;
  const selectedAt = Date.parse(request.selectedAt!);
  return Number.isFinite(selectedAt) ? selectedAt + REQUEST_DRIVER_WAIT_MS : null;
}
