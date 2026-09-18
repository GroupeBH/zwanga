import { useCallback, useMemo } from 'react';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useGetMyActivityBookingsQuery, useGetMyBookingHistoryInfiniteQuery } from '@/store/api/bookingApi';
import { flattenHistoryPages, isHistoricalBooking } from '@/utils/rideHistory';
import type { BookingTab } from '@/features/bookings/bookingsModel';

export function useBookingsFeed(tab: BookingTab) {
  const active = useScreenIsActive();
  const activity = useGetMyActivityBookingsQuery(undefined, {
    pollingInterval: active && tab === 'active' ? 60_000 : 0,
    skipPollingIfUnfocused: true,
  });
  const history = useGetMyBookingHistoryInfiniteQuery({}, {
    skip: !active || tab !== 'history', refetchOnMountOrArgChange: 60,
  });
  const activeBookings = useMemo(() => (activity.data ?? []).filter(booking =>
    (booking.status === 'pending' || booking.status === 'accepted') && !isHistoricalBooking(booking)), [activity.data]);
  const historyBookings = useMemo(() => flattenHistoryPages(history.currentData?.pages), [history.currentData]);
  const selected = tab === 'history' ? history : activity;
  const { refetch: refreshSelected, isUninitialized } = selected;
  const refetch = useCallback(() => {
    if (!isUninitialized) void refreshSelected();
  }, [isUninitialized, refreshSelected]);
  return {
    activeBookings,
    displayBookings: tab === 'history' ? historyBookings : activeBookings,
    isLoading: selected.isLoading, isFetching: selected.isFetching, isError: selected.isError,
    refetch,
    hasMore: history.hasNextPage, loadingMore: history.isFetchingNextPage,
    loadMore: () => {
      if (active && tab === 'history' && history.hasNextPage && !history.isFetching) void history.fetchNextPage();
    },
  };
}
