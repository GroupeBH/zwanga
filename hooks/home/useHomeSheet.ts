import { getTabBarMetrics } from '@/constants/navigation';
import { Spacing } from '@/constants/styles';
import type { HomeSheetMode } from '@/features/home/homeTypes';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Platform, type LayoutChangeEvent,
} from 'react-native';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomePassengerActivity } from '@/hooks/home/useHomePassengerActivity';
import type { useHomeTripFeed } from '@/hooks/home/useHomeTripFeed';
import type { useHomeTripSelection } from '@/hooks/home/useHomeTripSelection';
type Props =
  Pick<ReturnType<typeof useHomeContext>,
    'isDriver'
    | 'isScreenActive'
    | 'currentUser'
    | 'width'
    | 'insets'
    | 'height'
    | 'router'
  >
  & Pick<ReturnType<typeof useHomeTripSelection>,
    'isHomeSheetLockedRetracted'
    | 'latestTrips'
  >
  & Pick<ReturnType<typeof useHomePassengerActivity>,
    'notificationsData'
    | 'availableDriverRequests'
    | 'availableTripRequestsLoading'
    | 'availableTripRequestsError'
    | 'refetchAvailableTripRequests'
  >
  & Pick<ReturnType<typeof useHomeTripFeed>,
    'tripsLoading'
    | 'tripsError'
    | 'refetchTrips'
  >;
export function useHomeSheet({
  isDriver,
  isScreenActive = true,
  isHomeSheetLockedRetracted,
  currentUser,
  notificationsData,
  width,
  insets,
  height,
  latestTrips,
  availableDriverRequests,
  availableTripRequestsLoading,
  tripsLoading,
  availableTripRequestsError,
  tripsError,
  refetchAvailableTripRequests,
  refetchTrips,
  router,
}: Props) {
  const [tripsSheetOpen, setTripsSheetOpen] = useState(true);

  const [homeSheetMode, setHomeSheetMode] = useState<HomeSheetMode>('trips');

  useEffect(() => {
    if (!isDriver && homeSheetMode === 'requests') {
      setHomeSheetMode('trips');
    }
  }, [homeSheetMode, isDriver]);

  useEffect(() => {
    if (!isHomeSheetLockedRetracted) {
      return;
    }

    // Temporarily retract during a ride without losing the user's open/closed choice.
    setHomeSheetMode('trips');
  }, [isHomeSheetLockedRetracted]);

  const firstName = currentUser?.firstName || currentUser?.name?.split(' ')[0] || 'Kinshasa';

  const avatarUri = currentUser?.profilePicture || currentUser?.avatar;

  const unreadNotifications = notificationsData?.unreadCount ?? 0;

  const isCompactScreen = width <= 360;

  const tabBarMetrics = getTabBarMetrics(insets.bottom);

  const sheetBottomOffset = Platform.OS === 'ios' ? Math.max(tabBarMetrics.height - 2, 0) : 0;

  const openSheetHeight = Math.min(Math.max(height * 0.26, isCompactScreen ? 246 : 250), 258);

  const retractedSheetHeight = 68;

  const effectiveTripsSheetOpen = tripsSheetOpen && !isHomeSheetLockedRetracted;

  const sheetHeight = effectiveTripsSheetOpen ? openSheetHeight : retractedSheetHeight;

  const [sheetMeasurement, setSheetMeasurement] = useState<{ height: number; width: number; open: boolean } | null>(null);
  // Native layout events can arrive after blur, rotation, collapse or unmount.
  // Each committed layout context invalidates callbacks from the previous one.
  const layoutContext = useMemo(() => ({ width, open: effectiveTripsSheetOpen, isScreenActive }),
    [width, effectiveTripsSheetOpen, isScreenActive]);
  const liveLayoutContext = useRef<typeof layoutContext | null>(null);
  useLayoutEffect(() => {
    // A hidden sheet may settle after a cached/network update. Retain its current
    // valid size for the return to Home; only obsolete callbacks are discarded.
    liveLayoutContext.current = layoutContext;
    return () => { liveLayoutContext.current = null; };
  }, [isScreenActive, layoutContext]);
  // Measure only to position the map control. Never feed this height back into
  // the sheet itself: its content determines its height, without a layout loop.
  const onSheetLayout = useCallback((event: LayoutChangeEvent) => {
    if (liveLayoutContext.current !== layoutContext) return;
    const measuredHeight = Math.ceil(event.nativeEvent.layout.height);
    if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return;
    setSheetMeasurement(previous => {
      if (liveLayoutContext.current !== layoutContext) return previous;
      return previous?.height === measuredHeight && previous.width === width && previous.open === effectiveTripsSheetOpen
        ? previous : { height: measuredHeight, width, open: effectiveTripsSheetOpen };
    });
  }, [layoutContext, width, effectiveTripsSheetOpen]);
  const displayedSheetHeight = sheetMeasurement?.width === width
    && sheetMeasurement.open === effectiveTripsSheetOpen ? sheetMeasurement.height : sheetHeight;
  const locationButtonBottom = sheetBottomOffset + displayedSheetHeight + Spacing.md;

  const tripCardWidth = Math.min(width - 40, 354);

  const isRequestsSheetMode = homeSheetMode === 'requests' && isDriver;

  const sheetTitle = isHomeSheetLockedRetracted
    ? 'Trajet en cours'
    : isRequestsSheetMode
      ? 'Clients'
      : 'Trajets';

  const sheetLoading = isRequestsSheetMode ? availableTripRequestsLoading : tripsLoading;

  const sheetError = isRequestsSheetMode ? availableTripRequestsError : tripsError;

  const sheetEmpty = isRequestsSheetMode ? availableDriverRequests.length === 0 : latestTrips.length === 0;

  const refetchSheetContent = useCallback(() => {
    if (isRequestsSheetMode) {
      return refetchAvailableTripRequests();
    }

    return refetchTrips();
  }, [isRequestsSheetMode, refetchAvailableTripRequests, refetchTrips]);

  const openSheetIndex = useCallback(() => {
    if (isRequestsSheetMode) {
      router.push('/requests');
      return;
    }

    router.push('/search');
  }, [isRequestsSheetMode, router]);

  const toggleTripsSheet = useCallback(() => {
    if (isHomeSheetLockedRetracted) {
      return;
    }

    setTripsSheetOpen((current) => !current);
  }, [isHomeSheetLockedRetracted]);
  return {
    avatarUri,
    firstName,
    unreadNotifications,
    sheetBottomOffset,
    sheetHeight,
    onSheetLayout,
    effectiveTripsSheetOpen,
    toggleTripsSheet,
    sheetTitle,
    openSheetIndex,
    isRequestsSheetMode,
    setHomeSheetMode,
    sheetLoading,
    sheetError,
    refetchSheetContent,
    sheetEmpty,
    tripCardWidth,
    locationButtonBottom,
  };
}
