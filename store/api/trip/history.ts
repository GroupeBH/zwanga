import type { Trip } from '@/types';
import { isHistoricalTrip, matchesHistorySearch } from '@/utils/rideHistory';
import type { BaseEndpointBuilder } from '../types';
import { readHistoryPage, type HistoryPage, type HistoryArgs } from '../historyPage';
import type { ServerTrip } from './serverTypes';
import { mapServerTripToClient } from './tripMapper';
import { myTripsListTag } from './contracts';

export function buildTripHistory(builder: BaseEndpointBuilder) {
  return { getMyTripHistory: builder.infiniteQuery<HistoryPage<Trip>, HistoryArgs, string | null>({
    keepUnusedDataFor: 30,
    infiniteQueryOptions: { initialPageParam: null, getNextPageParam: page => page.nextCursor ?? undefined },
    queryFn: ({ queryArg, pageParam }, _api, _options, read) => readHistoryPage<ServerTrip, Trip>(
      read, '/trips/my-trips', pageParam, queryArg.search, mapServerTripToClient,
      trip => isHistoricalTrip(trip) && matchesHistorySearch(trip, queryArg.search ?? ''), trip => trip.departureTime),
    providesTags: result => [myTripsListTag,
      ...(result?.pages.flatMap(page => page.data.map(({ id }) => ({ type: 'MyTrips' as const, id }))) ?? [])],
  }) };
}
