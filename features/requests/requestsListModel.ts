import type { TripRequest } from '@/types';
import { normalizeHistorySearch } from '@/utils/rideHistory';

export type RequestTab = 'available' | 'my-requests';
export const EMPTY_REQUESTS: TripRequest[] = [];

/** Preserve history, but bring responses and unstarted pickups above older requests. */
export function rankOwnRequests(requests: readonly TripRequest[]) {
  const priority = (request: TripRequest) => {
    if (request.status === 'driver_selected' && !request.tripId) return 0;
    if (request.status === 'offers_received') return 1;
    if (request.status === 'pending') return 2;
    if (request.status === 'cancelled') return 4;
    if (request.status === 'expired') return 5;
    return 3;
  };
  const timestamp = (request: TripRequest) => Date.parse(request.updatedAt || request.createdAt) || 0;
  return [...requests].sort((a, b) => priority(a) - priority(b) || timestamp(b) - timestamp(a) || a.id.localeCompare(b.id));
}

/** Normalize once per data update, not for every keystroke. No geocoding or HTTP. */
export function indexRequests(requests: readonly TripRequest[]) {
  return requests.map(request => ({
    request,
    text: normalizeHistorySearch([
      request.departure?.name, request.departure?.address, request.departure?.reference,
      request.arrival?.name, request.arrival?.address, request.arrival?.reference,
      request.passengerName, request.selectedDriverName,
    ].filter(Boolean).join(' ')),
  }));
}

export function filterRequestIndex(index: ReturnType<typeof indexRequests>, query: string) {
  const terms = normalizeHistorySearch(query).split(/\s+/).filter(Boolean);
  return index.filter(entry => terms.every(term => entry.text.includes(term))).map(entry => entry.request);
}
