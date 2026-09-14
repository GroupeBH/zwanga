import { getTabBarMetrics } from '@/constants/navigation';
import { Spacing } from '@/constants/styles';
import type { HomeSheetMode } from '@/features/home/homeTypes';
import { useCallback, useEffect, useState } from 'react';
import {
  Platform
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
    ? Math.min(Math.max(height * 0.38, isCompactScreen ? 328 : 354), 388)
    : Math.min(Math.max(height * 0.34, isCompactScreen ? 296 : 318), 348);

  const retractedSheetHeight = 78;

  const effectiveTripsSheetOpen = tripsSheetOpen && !isHomeSheetLockedRetracted;

  const sheetHeight = effectiveTripsSheetOpen ? openSheetHeight : retractedSheetHeight;

  const locationButtonBottom = sheetBottomOffset + sheetHeight + Spacing.md;

  const tripCardWidth = Math.min(width - 56, 342);

  const availableTripsLabel = `${latestTrips.length} trajet${latestTrips.length > 1 ? 's' : ''}`;

  const availableRequestsLabel = `${availableDriverRequests.length} demande${availableDriverRequests.length > 1 ? 's' : ''}`;

  const isRequestsSheetMode = homeSheetMode === 'requests' && isDriver;

  const sheetTitle = isHomeSheetLockedRetracted
    ? ongoingDriverTrip || trackedTripInfo?.role === 'driver'
      ? 'Trajet conducteur en cours'
      : 'Trajet réservé en cours'
    : isRequestsSheetMode
      ? 'Demandes de trajet'
      : 'Trajets publiés';

  const sheetSubtitle = isHomeSheetLockedRetracted
    ? ongoingDriverTrip || trackedTripInfo?.role === 'driver'
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
