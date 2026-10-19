import { getTabBarMetrics } from '@/constants/navigation';
import { Spacing } from '@/constants/styles';
import { HOME_MAP_PADDING } from '@/features/home/homeMapAppearance';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  > & { hasMapPriorities?: boolean };
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
  hasMapPriorities = false,
}: Props) {
  const [tripsSheetOpen, setTripsSheetOpen] = useState(true);

  const firstName = currentUser?.firstName?.trim() || currentUser?.name?.trim().split(/\s+/)[0] || '';

  const unreadNotifications = notificationsData?.unreadCount ?? 0;

  const tabBarMetrics = getTabBarMetrics(insets.bottom);

  const sheetBottomOffset = Platform.OS === 'ios' ? Math.max(tabBarMetrics.height - 2, 0) : 0;

  // Android excludes the tab bar from the scene; iOS overlays it. Measure the
  // actual scene so the map keeps the same ~37% share as the reference layouts.
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const onHomeLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
    if (nextWidth <= 0 || nextHeight <= 0) return;
    setViewport(previous => previous?.width === nextWidth && previous.height === nextHeight
      ? previous : { width: nextWidth, height: nextHeight });
  }, []);
  const viewportHeight = viewport?.width === width ? viewport.height
    : height - (Platform.OS === 'ios' ? 0 : tabBarMetrics.height);
  const availableHeight = viewportHeight - sheetBottomOffset;
  // Priorities are overlays, not layout content: adding/removing one must never
  // resize the native map or push the discovery panel down.
  const openSheetHeight = Math.min(availableHeight * 0.63, 680);

  const retractedSheetHeight = 78;

  const effectiveTripsSheetOpen = tripsSheetOpen && !isHomeSheetLockedRetracted;

  const sheetHeight = effectiveTripsSheetOpen ? openSheetHeight : retractedSheetHeight;

  const [sheetMeasurement, setSheetMeasurement] = useState<{ height: number; width: number; open: boolean; expectedHeight: number } | null>(null);
  // Native layout events can arrive after blur, rotation, collapse or unmount.
  // Each committed layout context invalidates callbacks from the previous one.
  const layoutContext = useMemo(() => ({ width, open: effectiveTripsSheetOpen, isScreenActive, sheetHeight }),
    [width, effectiveTripsSheetOpen, isScreenActive, sheetHeight]);
  const liveLayoutContext = useRef<typeof layoutContext | null>(null);
  useLayoutEffect(() => {
    // A hidden sheet may settle after a cached/network update. Retain its current
    // valid size for the return to Home; only obsolete callbacks are discarded.
    liveLayoutContext.current = layoutContext;
    return () => { liveLayoutContext.current = null; };
  }, [isScreenActive, layoutContext]);
  // Measure only to position the map control. Never feed this height back into
  // the sheet itself: its viewport determines its height, without a layout loop.
  const onSheetLayout = useCallback((event: LayoutChangeEvent) => {
    if (liveLayoutContext.current !== layoutContext) return;
    const measuredHeight = Math.ceil(event.nativeEvent.layout.height);
    if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return;
    setSheetMeasurement(previous => {
      if (liveLayoutContext.current !== layoutContext) return previous;
      return previous?.height === measuredHeight && previous.width === width && previous.open === effectiveTripsSheetOpen && previous.expectedHeight === sheetHeight
        ? previous : { height: measuredHeight, width, open: effectiveTripsSheetOpen, expectedHeight: sheetHeight };
    });
  }, [layoutContext, width, effectiveTripsSheetOpen, sheetHeight]);
  const displayedSheetHeight = sheetMeasurement?.width === width
    && sheetMeasurement.open === effectiveTripsSheetOpen && sheetMeasurement.expectedHeight === sheetHeight ? sheetMeasurement.height : sheetHeight;
  const locationButtonBottom = sheetBottomOffset + displayedSheetHeight + Spacing.md;
  const mapBottomOffset = sheetBottomOffset + sheetHeight - 26;
  const priorityTop = (insets.top || 0) + Spacing.lg + 56;
  const priorityBottom = sheetBottomOffset + sheetHeight + 72;
  // On short screens use the space BESIDE the location control instead of
  // changing the map/panel heights. The complete priority deck can scroll.
  const compactPriorities = viewportHeight - priorityTop - priorityBottom < 96;
  const mapPriorityLayout = { top: priorityTop,
    bottom: compactPriorities ? sheetBottomOffset + sheetHeight + 12 : priorityBottom,
    compact: compactPriorities };
  const homeMapPadding = HOME_MAP_PADDING;
  const showLocationLegend = !(hasMapPriorities && compactPriorities);

  const tripCardWidth = Math.min(width - 40, 354);

  // Driver discovery is always clients, including after returning from a ride.
  const isRequestsSheetMode = isDriver;

  const sheetTitle = isHomeSheetLockedRetracted
    ? 'Trajet en cours'
    : isRequestsSheetMode
      ? 'Clients'
      : 'Trajets';

  const sheetLoading = isRequestsSheetMode ? availableTripRequestsLoading : tripsLoading && latestTrips.length === 0;

  const sheetError = isRequestsSheetMode ? availableTripRequestsError : tripsError && latestTrips.length === 0;

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
    sheetLoading,
    sheetError,
    refetchSheetContent,
    sheetEmpty,
    tripCardWidth,
    locationButtonBottom,
    mapBottomOffset,
    mapPriorityLayout,
    homeMapPadding,
    showLocationLegend,
    onHomeLayout,
  };
}
