import { normalizeTripRequestVehicleType } from '../../features/request-detail/requestDetailModel';
import { isDriverAccount as hasDriverRole } from '@/utils/accountRole';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled, useDisplayRefetch, useDisplayReadData } from '@/hooks/useDisplayReads';
import { useDialog } from '@/components/ui/DialogProvider';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { useAssignedTripNavigation } from '@/hooks/useAssignedTripNavigation';
import { useGetTripByIdQuery, useStartTripMutation } from '@/store/api/tripApi';
import {
  useAcceptTripRequestMutation,
  useCancelTripRequestMutation,
  useGetTripRequestByIdQuery,
  useStartTripFromRequestMutation,
  useUpdateTripRequestMutation,
} from '@/store/api/tripRequestApi';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useGetVehiclesQuery } from '@/store/api/vehicleApi';
import { useGetMyBookingsForTripQuery } from '@/store/api/bookingApi';
import { useRequestDetailExit } from './useRequestDetailExit';
import { getTripRequestCreateHref } from '@/utils/requestNavigation';
import { reportEntryFailure } from '@/services/entryRecovery';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

export function useRequestDetailData() {
  const isScreenActive = useScreenIsActive();
  const readsEnabled = useDisplayReadsEnabled(isScreenActive);
  const router = useRouter();
  const openDriverOnboarding = useCallback(() => {
    router.push({
      pathname: '/profile',
      params: { openDriverOnboarding: '1' },
    } as any);
  }, [router]);
  const params = useLocalSearchParams<{ id?: string | string[]; editSchedule?: string | string[] }>();
  const { showDialog } = useDialog();

  // Extraire l'ID correctement (peut être un tableau avec Expo Router)
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const editScheduleParam = Array.isArray(params.editSchedule)
    ? params.editSchedule[0]
    : params.editSchedule;
  const shouldOpenScheduleEditor = editScheduleParam === '1';
  const isCreateRouteAlias = id === 'index';

  const { data: currentUser } = useGetCurrentUserQuery(undefined, displayReadOptions(readsEnabled));
  const isDriverAccount = hasDriverRole(currentUser);
  const exit = useRequestDetailExit(router, isScreenActive, `${currentUser?.id}:${id}`);
  const goHome = exit.goHome;
  const { isIdentityVerified, checkIdentity } = useIdentityCheck();

  // État pour le polling interval dynamique
  const [pollingInterval, setPollingInterval] = useState(45_000);

  const { currentData: liveRequest, isLoading, isFetching: isFetchingRequest, error, startedTimeStamp, fulfilledTimeStamp, refetch: rawRefetch, isError } = useGetTripRequestByIdQuery(id || '', {
    ...displayReadOptions(readsEnabled && Boolean(id) && !isCreateRouteAlias, pollingInterval),
  });
  const cachedRequest = useDisplayReadData(id ?? '', liveRequest);
  const tripRequest = currentUser?.id && (isDriverAccount || cachedRequest?.passengerId === currentUser.id)
    ? cachedRequest : undefined;
  const refetch = useDisplayRefetch(readsEnabled && Boolean(id) && !isCreateRouteAlias, id ?? '', rawRefetch);
  const { currentData: liveAssignedTrip, error: assignedTripError } = useGetTripByIdQuery(tripRequest?.tripId || '', {
    ...displayReadOptions(readsEnabled && Boolean(tripRequest?.tripId), tripRequest?.status === 'driver_selected' ? 30_000 : 0),
  });
  const assignedTrip = useDisplayReadData(tripRequest?.tripId ?? '', liveAssignedTrip);
  const ownerTripId = tripRequest?.passengerId === currentUser?.id ? tripRequest?.tripId : null;
  const { currentData: bookings, error: bookingError, isFetching: bookingFetching } = useGetMyBookingsForTripQuery(ownerTripId ?? '',
    displayReadOptions(readsEnabled && !!ownerTripId, 5_000));
  const { passengerTripId, isOpeningAssignedTrip } = useAssignedTripNavigation({
    requestId: id,
    tripRequest,
    assignedTrip,
    bookings,
    bookingError,
    isResolvingBooking: !!ownerTripId && !bookings && (!bookingError || bookingFetching),
    userId: currentUser?.id,
    requestError: error,
    tripError: assignedTripError,
    isScreenActive,
    router,
  });

  useEffect(() => {
    if (isCreateRouteAlias) {
      router.replace(getTripRequestCreateHref());
    }
  }, [isCreateRouteAlias, router]);

  // Mettre à jour le polling interval en fonction du statut de la commande
  React.useEffect(() => {
    if (tripRequest?.status === 'pending' || tripRequest?.status === 'offers_received') {
      // Socket invalidation is the fast path; this bounded foreground read covers a lost event.
      setPollingInterval(tripRequest.passengerId === currentUser?.id ? 5_000 : 30_000);
    } else if (tripRequest?.status === 'driver_selected') {
      setPollingInterval(15000); // Suivre rapidement le démarrage pour masquer l'annulation
    } else {
      setPollingInterval(0); // Pas de polling si annulé ou expiré
    }
  }, [tripRequest?.status, tripRequest?.passengerId, currentUser?.id]);

  useEffect(() => {
    if (readsEnabled && error && !isFetchingRequest) {
      reportEntryFailure('request-detail', 'read', startedTimeStamp ?? Date.now(), error);
    }
  }, [readsEnabled, error, isFetchingRequest, startedTimeStamp]);
  const { data: vehicles = [] } = useGetVehiclesQuery(undefined, {
    ...displayReadOptions(readsEnabled && isDriverAccount),
  });

  // Filtrer pour n'afficher que les véhicules actifs
  const activeVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => vehicle.isActive !== false);
  }, [vehicles]);
  const requestedVehicleType = normalizeTripRequestVehicleType(
    tripRequest?.vehicleType,
  );
  const compatibleActiveVehicles = useMemo(
    () =>
      activeVehicles.filter(
        (vehicle) =>
          normalizeTripRequestVehicleType(vehicle.type) === requestedVehicleType,
      ),
    [activeVehicles, requestedVehicleType],
  );

  const [acceptTripRequest, { isLoading: isAcceptingTripRequest }] = useAcceptTripRequestMutation();
  const [cancelRequest, { isLoading: isCancelling }] = useCancelTripRequestMutation();
  const [updateTripRequest, { isLoading: isUpdating }] = useUpdateTripRequestMutation();
  const [startTripFromRequest, { isLoading: isStartingTripFromRequest }] = useStartTripFromRequestMutation();
  const [startTrip, { isLoading: isStartingTrip }] = useStartTripMutation();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (error) {
      console.warn('Error refreshing trip request data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  return {
    responseWindowStartedAt: fulfilledTimeStamp === undefined ? undefined : Math.min(startedTimeStamp ?? fulfilledTimeStamp, fulfilledTimeStamp),
    isScreenActive,
    tripRequest,
    compatibleActiveVehicles,
    currentUser,
    assignedTrip,
    isDriverAccount,
    isIdentityVerified,
    isAcceptingTripRequest,
    id,
    showDialog,
    startTripFromRequest,
    refetch,
    router,
    requestedVehicleType,
    acceptTripRequest,
    startTrip,
    shouldOpenScheduleEditor,
    isUpdating,
    updateTripRequest,
    cancelRequest,
    goHome,
    isLoading,
    isFetchingRequest,
    isOpeningAssignedTrip: isOpeningAssignedTrip || exit.leaving,
    isError,
    error,
    passengerTripId,
    refreshing,
    onRefresh,
    isCancelling,
    isStartingTripFromRequest,
    isStartingTrip,
    openDriverOnboarding,
    checkIdentity,
  };
}
