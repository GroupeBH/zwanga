import { normalizeTripRequestVehicleType } from '../../features/request-detail/requestDetailModel';
import { isDriverAccount as hasDriverRole } from '@/utils/accountRole';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
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
import { getTripRequestCreateHref } from '@/utils/requestNavigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

export function useRequestDetailData() {
  const isScreenActive = useScreenIsActive();
  const router = useRouter();
  const goHome = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);
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

  const { data: currentUser } = useGetCurrentUserQuery();
  const isDriverAccount = hasDriverRole(currentUser);
  const { isIdentityVerified, checkIdentity } = useIdentityCheck();

  // État pour le polling interval dynamique
  const [pollingInterval, setPollingInterval] = useState(45_000);

  const { currentData: tripRequest, isLoading, isFetching: isFetchingRequest, error, refetch, isError } = useGetTripRequestByIdQuery(id || '', {
    skip: !id || isCreateRouteAlias,
    pollingInterval: isScreenActive ? pollingInterval : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
    refetchOnReconnect: false,
  });
  const { currentData: assignedTrip, error: assignedTripError } = useGetTripByIdQuery(tripRequest?.tripId || '', {
    skip: !tripRequest?.tripId,
    pollingInterval: isScreenActive ? (tripRequest?.status === 'driver_selected' ? 30_000 : 0) : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
    refetchOnReconnect: false,
  });
  const { passengerTripId, isOpeningAssignedTrip } = useAssignedTripNavigation({
    requestId: id,
    tripRequest,
    assignedTrip,
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

  // Mettre à jour le polling interval en fonction du statut de la demande
  React.useEffect(() => {
    if (tripRequest?.status === 'pending' || tripRequest?.status === 'offers_received') {
      setPollingInterval(30000); // 30 secondes pour les demandes actives
    } else if (tripRequest?.status === 'driver_selected') {
      setPollingInterval(15000); // Suivre rapidement le démarrage pour masquer l'annulation
    } else {
      setPollingInterval(0); // Pas de polling si annulé ou expiré
    }
  }, [tripRequest?.status]);

  useEffect(() => {
    if (__DEV__ && error) {
      console.warn('[TripRequestDetails] Chargement de la demande impossible:', error);
    }
  }, [error]);
  const { data: vehicles = [] } = useGetVehiclesQuery(undefined, {
    skip: !isDriverAccount,
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
    isOpeningAssignedTrip,
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
