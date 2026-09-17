import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGetMyActivityTripsQuery, useGetMyTripHistoryInfiniteQuery } from '@/store/api/tripApi';
import { useGetMyActivityBookingsQuery, useGetMyBookingHistoryInfiniteQuery } from '@/store/api/bookingApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { flattenHistoryPages, normalizeHistorySearch } from '@/utils/rideHistory';
import type { MainTab, SubTab } from '@/features/trips/tripsModel';

export function useTripsFeeds(mainTab: MainTab, subTab: SubTab, search: string) {
  const active = useScreenIsActive(), history = subTab === 'completed';
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(normalizeHistorySearch(search)), 350);
    return () => clearTimeout(timer); }, [search]);
  const polling = { pollingInterval: active && !history ? 60_000 : 0, skipPollingIfUnfocused: true, refetchOnReconnect: false };
  const trips = useGetMyActivityTripsQuery(undefined, polling);
  const bookings = useGetMyActivityBookingsQuery(undefined, polling);
  const tripHistory = useGetMyTripHistoryInfiniteQuery({ search: debouncedSearch },
    { skip: !active || !history || mainTab !== 'published', refetchOnMountOrArgChange: 60 });
  const bookingHistory = useGetMyBookingHistoryInfiniteQuery({ search: debouncedSearch },
    { skip: !active || !history || mainTab !== 'bookings', refetchOnMountOrArgChange: 60 });
  const pastTrips = useMemo(() => flattenHistoryPages(tripHistory.currentData?.pages), [tripHistory.currentData]);
  const pastBookings = useMemo(() => flattenHistoryPages(bookingHistory.currentData?.pages), [bookingHistory.currentData]);
  const currentHistory = mainTab === 'published' ? tripHistory : bookingHistory;
  const { refetch: refreshTripPage, isUninitialized: tripPageNotStarted } = tripHistory;
  const { refetch: refreshBookingPage, isUninitialized: bookingPageNotStarted } = bookingHistory;
  const { refetch: refreshActiveTrips } = trips;
  const { refetch: refreshActiveBookings } = bookings;
  const { hasNextPage, isFetching, fetchNextPage } = currentHistory;
  const refetchTrips = useCallback(async () => {
    if (active && history && mainTab === 'published') {
      if (tripPageNotStarted) return { data: undefined };
      const result = await refreshTripPage(); return { data: flattenHistoryPages(result.data?.pages) };
    }
    return refreshActiveTrips();
  }, [active, history, mainTab, tripPageNotStarted, refreshTripPage, refreshActiveTrips]);
  const refetchBookings = useCallback(async () => {
    if (active && history && mainTab === 'bookings') {
      if (bookingPageNotStarted) return { data: undefined };
      const result = await refreshBookingPage(); return { data: flattenHistoryPages(result.data?.pages) };
    }
    return refreshActiveBookings();
  }, [active, history, mainTab, bookingPageNotStarted, refreshBookingPage, refreshActiveBookings]);
  const loadMore = useCallback(() => {
    if (active && history && hasNextPage && !isFetching) void fetchNextPage();
  }, [active, history, hasNextPage, isFetching, fetchNextPage]);
  return {
    myTrips: history ? pastTrips : trips.data, myBookings: history ? pastBookings : bookings.data,
    activeTrips: trips.data, activeBookings: bookings.data,
    refetchTrips, refetchBookings,
    tripsLoading: history ? tripHistory.isFetching && !tripHistory.currentData : trips.isLoading,
    bookingsLoading: history ? bookingHistory.isFetching && !bookingHistory.currentData : bookings.isLoading,
    tripsFetching: history ? tripHistory.isFetching : trips.isFetching,
    bookingsFetching: history ? bookingHistory.isFetching : bookings.isFetching,
    tripsError: history ? tripHistory.isError : trips.isError,
    bookingsError: history ? bookingHistory.isError : bookings.isError,
    history, loadMore, hasMore: currentHistory.hasNextPage,
    loadingMore: currentHistory.isFetchingNextPage, historyError: currentHistory.isError,
  };
}
