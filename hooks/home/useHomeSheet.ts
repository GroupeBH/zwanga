import { getTabBarMetrics } from '@/constants/navigation';
import { Spacing } from '@/constants/styles';
import type { HomeSheetMode } from '@/features/home/homeTypes';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Platform, type LayoutChangeEvent,
} from 'react-native';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeDriverActivity } from '@/hooks/home/useHomeDriverActivity';
import type { useHomePassengerActivity } from '@/hooks/home/useHomePassengerActivity';
import type { useHomePassengerMarkers } from '@/hooks/home/useHomePassengerMarkers';
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
    | 'trackedTripInfo'
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
  & Pick<ReturnType<typeof useHomeDriverActivity>,
    'ongoingDriverTrip'
  >
  & Pick<ReturnType<typeof useHomePassengerMarkers>,
    'visibleDriverPassengerMarkers'
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
  ongoingDriverTrip,
  trackedTripInfo,
  visibleDriverPassengerMarkers,
  availableTripRequestsLoading,
  tripsLoading,
  availableTripRequestsError,
  tripsError,
  refetchAvailableTripRequests,
  refetchTrips,
  router,
}: Props) {
  const [tripsSheetOpen, setTripsSheetOpen] = useState(false);

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

    setTripsSheetOpen(false);
    setHomeSheetMode('trips');
  }, [isHomeSheetLockedRetracted]);

  const firstName = currentUser?.firstName || currentUser?.name?.split(' ')[0] || 'Kinshasa';

  const avatarUri = currentUser?.profilePicture || currentUser?.avatar;

  const unreadNotifications = notificationsData?.unreadCount ?? 0;

  const isCompactScreen = width <= 360;

  const tabBarMetrics = getTabBarMetrics(insets.bottom);

  const sheetBottomOffset = Platform.OS === 'ios' ? Math.max(tabBarMetrics.height - 2, 0) : 0;

  const openSheetHeight = isDriver
    ? Math.min(Math.max(height * 0.30, isCompactScreen ? 294 : 298), 306)
    : Math.min(Math.max(height * 0.26, isCompactScreen ? 246 : 250), 258);

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

  const availableTripsLabel = `${latestTrips.length} trajet${latestTrips.length > 1 ? 's' : ''}`;

  const availableRequestsLabel = `${availableDriverRequests.length} demande${availableDriverRequests.length > 1 ? 's' : ''}`;

  const isRequestsSheetMode = homeSheetMode === 'requests' && isDriver;

  const sheetTitle = isHomeSheetLockedRetracted
    ? ongoingDriverTrip
      ? 'Trajet conducteur en cours'
      : 'Trajet réservé en cours'
    : isRequestsSheetMode
      ? 'Demandes de trajet'
      : 'Trajets publiés';

  const sheetSubtitle = isHomeSheetLockedRetracted
    ? ongoingDriverTrip
      ? visibleDriverPassengerMarkers.length > 0
        ? `${visibleDriverPassengerMarkers.length} passager${visibleDriverPassengerMarkers.length > 1 ? 's' : ''} et votre véhicule en direct`
        : 'Votre véhicule reste visible en direct'
      : 'Votre position et le véhicule restent visibles'
    : isRequestsSheetMode
      ? availableDriverRequests.length > 0
        ? `${availableRequestsLabel} à traiter`
        : 'Aucune demande pour le moment'
      : latestTrips.length > 0
        ? `${availableTripsLabel} à parcourir`
        : 'Aucune offre pour le moment';

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
    availableTripsLabel,
    unreadNotifications,
    sheetBottomOffset,
    sheetHeight,
    onSheetLayout,
    effectiveTripsSheetOpen,
    toggleTripsSheet,
    sheetTitle,
    sheetSubtitle,
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
