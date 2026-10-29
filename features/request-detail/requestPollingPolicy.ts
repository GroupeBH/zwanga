import type { TripRequest } from '@/types';

/** Socket invalidations stay immediate; periodic reads still recover a lost server event. */
export function requestDetailPollInterval(request: TripRequest | undefined, userId: string | undefined, connected: boolean) {
  if (request?.status === 'pending' || request?.status === 'offers_received') {
    return request.passengerId === userId && !connected ? 5_000 : 30_000;
  }
  if (request?.status === 'driver_selected') return 15_000;
  return 0;
}

export const sharedOffersPollInterval = (connected: boolean) => connected ? 30_000 : 15_000;
