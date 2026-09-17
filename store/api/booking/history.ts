import type { Booking } from '@/types';
import { isHistoricalBooking, matchesHistorySearch } from '@/utils/rideHistory';
import type { BaseEndpointBuilder } from '../types';
import { readHistoryPage, type HistoryPage, type HistoryArgs } from '../historyPage';
import type { ServerBooking } from './serverTypes';
import { mapServerBookingToClient } from './bookingMapper';
import { bookingListTag } from './cachePolicy';

export function buildBookingHistory(builder: BaseEndpointBuilder) {
  return { getMyBookingHistory: builder.infiniteQuery<HistoryPage<Booking>, HistoryArgs, string | null>({
    keepUnusedDataFor: 30,
    infiniteQueryOptions: { initialPageParam: null, getNextPageParam: page => page.nextCursor ?? undefined },
    queryFn: ({ queryArg, pageParam }, _api, _options, read) => readHistoryPage<ServerBooking, Booking>(
      read, '/bookings/my-bookings', pageParam, queryArg.search, mapServerBookingToClient,
      booking => isHistoricalBooking(booking) && matchesHistorySearch(booking.trip, queryArg.search ?? '', booking.passengerDestination),
      booking => booking.trip?.departureTime ?? booking.createdAt),
    providesTags: result => [bookingListTag,
      ...(result?.pages.flatMap(page => page.data.map(({ id }) => ({ type: 'Booking' as const, id }))) ?? [])],
  }) };
}
