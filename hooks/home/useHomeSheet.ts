import { getTabBarMetrics } from '@/constants/navigation';
import { useCallback } from 'react';
import { Platform } from 'react-native';
import type { useHomeContext } from './useHomeContext';
import type { useHomeDiscoveryMode } from './useHomeDiscoveryMode';
import type { useHomePassengerActivity } from './useHomePassengerActivity';
import type { useHomeTripFeed } from './useHomeTripFeed';
import type { useHomeTripSelection } from './useHomeTripSelection';

type Props = Pick<ReturnType<typeof useHomeContext>, 'isDriver' | 'currentUser' | 'insets' | 'router'>
  & Pick<ReturnType<typeof useHomeTripSelection>, 'latestTrips'>
  & Pick<ReturnType<typeof useHomePassengerActivity>, 'notificationsData' | 'availableDriverRequests'
    | 'availableTripRequestsLoading' | 'availableTripRequestsError' | 'refetchAvailableTripRequests'>
  & Pick<ReturnType<typeof useHomeTripFeed>, 'tripsLoading' | 'tripsError' | 'refetchTrips'>
  & Pick<ReturnType<typeof useHomeDiscoveryMode>, 'isRequestsSheetMode'> & { isOnline?: boolean };
export function useHomeSheet({ isOnline = true, isDriver, isRequestsSheetMode: requestsSelected = isDriver,
  currentUser, notificationsData, insets, latestTrips, availableDriverRequests, availableTripRequestsLoading,
  tripsLoading, availableTripRequestsError, tripsError, refetchAvailableTripRequests, refetchTrips, router }: Props) {
  const isRequestsSheetMode = isDriver && requestsSelected;
  const sheetEmpty = isRequestsSheetMode ? availableDriverRequests.length === 0 : latestTrips.length === 0;
  const refetchSheetContent = useCallback(() => isRequestsSheetMode ? refetchAvailableTripRequests() : refetchTrips(),
    [isRequestsSheetMode, refetchAvailableTripRequests, refetchTrips]);
  const openSheetIndex = useCallback(() => router.push(isRequestsSheetMode ? '/requests' : '/search'),
    [isRequestsSheetMode, router]);
  return {
    avatarUri: currentUser?.profilePicture || currentUser?.avatar,
    firstName: currentUser?.firstName || currentUser?.name?.split(' ')[0] || 'Kinshasa',
    unreadNotifications: notificationsData?.unreadCount ?? 0,
    // Existing tabs are absolute on iOS and in normal flow on Android.
    sheetBottomOffset: Platform.OS === 'ios' ? Math.max(getTabBarMetrics(insets.bottom).height - 2, 0) : 0,
    locationButtonBottom: 36,
    openSheetIndex,
    isRequestsSheetMode,
    sheetLoading: isOnline && sheetEmpty && (isRequestsSheetMode ? availableTripRequestsLoading : tripsLoading),
    sheetError: isOnline && sheetEmpty && (isRequestsSheetMode ? availableTripRequestsError : tripsError),
    sheetOffline: !isOnline,
    refetchSheetContent,
    sheetEmpty,
  };
}
