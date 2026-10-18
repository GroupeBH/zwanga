import { useCallback, useMemo } from 'react';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useGetMyActivityBookingsQuery, useGetMyBookingHistoryInfiniteQuery } from '@/store/api/bookingApi';
import { flattenHistoryPages, isHistoricalBooking } from '@/utils/rideHistory';
import type { BookingTab } from '@/features/bookings/bookingsModel';
import { useDisplayReadsEnabled } from '@/hooks/useDisplayReads';

export function useBookingsFeed(tab: BookingTab) {
  const active = useScreenIsActive();
  const enabled = useDisplayReadsEnabled(active);
  const activity = useGetMyActivityBookingsQuery(undefined, {
    skip: !enabled || tab !== 'active', pollingInterval: 0,
    refetchOnFocus: false, refetchOnReconnect: false,
  });
  const history = useGetMyBookingHistoryInfiniteQuery({}, {
    skip: !enabled || tab !== 'history', refetchOnMountOrArgChange: true,
    refetchOnFocus: false, refetchOnReconnect: false,
  });
  const activeBookings = useMemo(() => (activity.data ?? []).filter(booking =>
    (booking.status === 'pending' || booking.status === 'accepted') && !isHistoricalBooking(booking)), [activity.data]);
  const historyBookings = useMemo(() => flattenHistoryPages(history.data?.pages), [history.data]);
  const selected = tab === 'history' ? history : activity;
  const { refetch: refreshSelected, isUninitialized } = selected;
  const refetch = useCallback(() => {
    if (enabled && !isUninitialized) void refreshSelected();
  }, [enabled, isUninitialized, refreshSelected]);
  return {
    activeBookings,
    displayBookings: tab === 'history' ? historyBookings : activeBookings,
    isLoading: enabled && selected.isLoading, isFetching: enabled && selected.isFetching,
    isError: selected.isError || !enabled,
    refetch,
    hasMore: history.hasNextPage, loadingMore: history.isFetchingNextPage,
    loadMore: () => {
      if (enabled && tab === 'history' && history.hasNextPage && !history.isFetching) void history.fetchNextPage();
    },
  };
}
