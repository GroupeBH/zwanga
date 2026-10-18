import type { Trip } from '@/types';
import type { BaseEndpointBuilder } from '../types';
import { cleanObject, tripListTag, type TripSearchParams } from './contracts';
import type { ServerTrip } from './serverTypes';
import { mapServerTripToClient } from './tripMapper';

type DiscoveryPage<T> = { data: T[]; nextCursor: string | null; previousCursor: string | null };
type PageParam = { cursor: string | null; direction: 'next' | 'previous' };
export function buildTripDiscovery(builder: BaseEndpointBuilder) {
  return { getTripDiscovery: builder.infiniteQuery<DiscoveryPage<Trip>, TripSearchParams, PageParam>({
    keepUnusedDataFor: 15,
    infiniteQueryOptions: {
      initialPageParam: { cursor: null, direction: 'next' }, maxPages: 3,
      getNextPageParam: page => page.nextCursor ? { cursor: page.nextCursor, direction: 'next' } : undefined,
      getPreviousPageParam: page => page.previousCursor ? { cursor: page.previousCursor, direction: 'previous' } : undefined,
    },
    query: ({ queryArg, pageParam }) => ({ url: '/trips/discovery', method: 'POST',
      body: cleanObject({ ...queryArg, ...pageParam, limit: 30 }) }),
    transformResponse: (page: DiscoveryPage<ServerTrip>) => ({ ...page, data: page.data.map(mapServerTripToClient) }),
    providesTags: result => [tripListTag, ...(result?.pages.flatMap(page => page.data.map(trip => ({ type: 'Trip' as const, id: trip.id }))) ?? [])],
  }) };
}
