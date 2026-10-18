import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGetMyActivityTripsQuery, useGetMyTripHistoryInfiniteQuery } from '@/store/api/tripApi';
import { useGetMyActivityBookingsQuery, useGetMyBookingHistoryInfiniteQuery } from '@/store/api/bookingApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useDisplayReadsEnabled, useDisplayRefetch, useDisplayReadData } from '@/hooks/useDisplayReads';
import { flattenHistoryPages, normalizeHistorySearch } from '@/utils/rideHistory';
import type { MainTab, SubTab } from '@/features/trips/tripsModel';

export function useTripsFeeds(mainTab: MainTab, subTab: SubTab, search: string) {
  const active = useScreenIsActive(), history = subTab === 'completed';
  const enabled = useDisplayReadsEnabled(active);
  const tripsEnabled = enabled && !history && mainTab === 'published';
  const bookingsEnabled = enabled && !history && mainTab === 'bookings';
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(normalizeHistorySearch(search)), 350);
    return () => clearTimeout(timer); }, [search]);
  // AccountActivityCoordinator owns live revisions and the legacy polling fallback.
  const options = { pollingInterval: 0, refetchOnFocus: false, refetchOnReconnect: false, refetchOnMountOrArgChange: 60 };
  const trips = useGetMyActivityTripsQuery(undefined, { ...options, skip: !tripsEnabled });
  const bookings = useGetMyActivityBookingsQuery(undefined, { ...options, skip: !bookingsEnabled });
  const tripHistory = useGetMyTripHistoryInfiniteQuery({ search: debouncedSearch },
    { ...options, skip: !enabled || !history || mainTab !== 'published' });
  const bookingHistory = useGetMyBookingHistoryInfiniteQuery({ search: debouncedSearch },
    { ...options, skip: !enabled || !history || mainTab !== 'bookings' });
  const tripPages = useDisplayReadData(`trip-history:${debouncedSearch}`, tripHistory.currentData);
  const bookingPages = useDisplayReadData(`booking-history:${debouncedSearch}`, bookingHistory.currentData);
  const pastTrips = useMemo(() => flattenHistoryPages(tripPages?.pages), [tripPages]);
  const pastBookings = useMemo(() => flattenHistoryPages(bookingPages?.pages), [bookingPages]);
  const currentHistory = mainTab === 'published' ? tripHistory : bookingHistory;
  const tripPageNotStarted = tripHistory.isUninitialized;
  const bookingPageNotStarted = bookingHistory.isUninitialized;
  const refreshTripPage = useDisplayRefetch(enabled && history && mainTab === 'published', `trip-history:${debouncedSearch}`, tripHistory.refetch);
  const refreshBookingPage = useDisplayRefetch(enabled && history && mainTab === 'bookings', `booking-history:${debouncedSearch}`, bookingHistory.refetch);
  const refreshActiveTrips = useDisplayRefetch(tripsEnabled, 'active-trips', trips.refetch);
  const refreshActiveBookings = useDisplayRefetch(bookingsEnabled, 'active-bookings', bookings.refetch);
  const { hasNextPage, isFetching, fetchNextPage } = currentHistory;
  const nextPage = useDisplayRefetch<unknown>(enabled && history && Boolean(hasNextPage) && !isFetching,
    `history-page:${mainTab}:${debouncedSearch}`, fetchNextPage);
  const refetchTrips = useCallback(async () => {
    if (enabled && history && mainTab === 'published') {
      if (tripPageNotStarted) return { data: undefined };
      const result = await refreshTripPage(); return { data: flattenHistoryPages(result.data?.pages) };
    }
    return refreshActiveTrips();
  }, [enabled, history, mainTab, tripPageNotStarted, refreshTripPage, refreshActiveTrips]);
  const refetchBookings = useCallback(async () => {
    if (enabled && history && mainTab === 'bookings') {
      if (bookingPageNotStarted) return { data: undefined };
      const result = await refreshBookingPage(); return { data: flattenHistoryPages(result.data?.pages) };
    }
    return refreshActiveBookings();
  }, [enabled, history, mainTab, bookingPageNotStarted, refreshBookingPage, refreshActiveBookings]);
  const loadMore = useCallback(() => {
    if (enabled && history && hasNextPage && !isFetching) void nextPage();
  }, [enabled, history, hasNextPage, isFetching, nextPage]);
  return {
    myTrips: history ? pastTrips : trips.data, myBookings: history ? pastBookings : bookings.data,
    activeTrips: trips.data, activeBookings: bookings.data,
    refetchTrips, refetchBookings,
    tripsLoading: enabled && (history ? tripHistory.isFetching && !tripPages : trips.isLoading),
    bookingsLoading: enabled && (history ? bookingHistory.isFetching && !bookingPages : bookings.isLoading),
    tripsFetching: enabled && (history ? tripHistory.isFetching : trips.isFetching),
    bookingsFetching: enabled && (history ? bookingHistory.isFetching : bookings.isFetching),
    tripsError: (active && !enabled) || (history ? tripHistory.isError : trips.isError),
    bookingsError: (active && !enabled) || (history ? bookingHistory.isError : bookings.isError),
    history, loadMore, hasMore: currentHistory.hasNextPage,
    loadingMore: currentHistory.isFetchingNextPage, historyError: currentHistory.isError,
  };
}
