import type { TripRequest } from '@/types';
import { MUTATION_RECONCILIATION_DELAYS_MS } from '@/constants/network';

export interface RequestAttempt {
  startedAt: number; departure: string; arrival: string;
  departureDateMin: string; departureDateMax: string;
  seats: number; price: number; vehicleType: string;
}

/** Reads only: a transport timeout never authorizes replaying the creation POST. */
export async function recoverRequest(attempt: RequestAttempt, read: () => Promise<TripRequest[]>, current: () => boolean) {
  for (const delay of MUTATION_RECONCILIATION_DELAYS_MS) {
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    if (!current()) return null;
    try {
      const requests = await read();
      if (!current()) return null;
      const matches = requests.filter(request => request.id &&
        new Date(request.createdAt).getTime() >= attempt.startedAt - 10_000 &&
        request.departure.name.trim().toLowerCase() === attempt.departure &&
        request.arrival.name.trim().toLowerCase() === attempt.arrival &&
        Date.parse(request.departureDateMin) === Date.parse(attempt.departureDateMin) &&
        Date.parse(request.departureDateMax) === Date.parse(attempt.departureDateMax) &&
        request.numberOfSeats === attempt.seats && Number(request.maxPricePerSeat) === attempt.price &&
        request.vehicleType === attempt.vehicleType);
      // More than one match is ambiguous too: let the user consult their orders.
      if (matches.length === 1) return matches[0].id;
    } catch { /* Preserve uncertainty when the verification also fails. */ }
  }
  return null;
}
