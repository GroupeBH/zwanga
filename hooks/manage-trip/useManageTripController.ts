import { useManageTripState } from './useManageTripState';
import { useManageTripTracking } from './useManageTripTracking';
import { useManageTripRouteEditor } from './useManageTripRouteEditor';
import { useManageTripActions } from './useManageTripActions';
import { useManageTripBookingActions } from './useManageTripBookingActions';
import type { BookingStatus } from '@/types';
import { reconcileAmbiguousMutation } from '@/utils/mutationReconciliation';
import { calculateDistance } from '@/utils/routeHelpers';
import { getGeoPointCoordinate, getTripLocationCoordinate } from '@/utils/tripCoordinates';
import { useCallback, useMemo } from 'react';



export function useManageTripController() {
  const state = useManageTripState();
  const trip = state.trip;

  const refreshAll = useCallback(async () => {
    state.setRefreshing(true);
    try {
      await Promise.all([state.refetchTrip(), state.refetchBookings()]);
    } catch (error) {
      console.warn('Error refreshing trip data:', error);
    } finally {
      state.setRefreshing(false);
    }
  }, [state.refetchTrip, state.refetchBookings]);

  const reconcileBookingStatus = useCallback(
    async (error: unknown, bookingId: string, expectedStatuses: readonly BookingStatus[]) =>
      reconcileAmbiguousMutation({
        error,
        loadSnapshot: async () => {
          const result = await state.refetchBookings();
          return result.data?.find((booking) => booking.id === bookingId) ?? null;
        },
        isApplied: (booking) => expectedStatuses.includes(booking.status),
      }),
    [state.refetchBookings],
  );

  const reconcileTripStatus = useCallback(
    async (error: unknown, expectedStatuses: readonly string[]) =>
      reconcileAmbiguousMutation({
        error,
        loadSnapshot: async () => (await state.refetchTrip()).data ?? null,
        isApplied: (latestTrip) => expectedStatuses.includes(latestTrip.status),
      }),
    [state.refetchTrip],
  );

  const rememberAcceptedBooking = useCallback((bookingId: string) => {
    state.setLocallyAcceptedBookingIds((current) => {
      if (current.has(bookingId)) return current;

      const next = new Set(current);
      next.add(bookingId);
      return next;
    });
  }, []);

  const tracking = useManageTripTracking({
    bookings: state.bookings,
    locallyAcceptedBookingIds: state.locallyAcceptedBookingIds,
    bookingsRef: state.bookingsRef,
    showDialogRef: state.showDialogRef,
    showDialog: state.showDialog,
    refetchTripRef: state.refetchTripRef,
    refetchTrip: state.refetchTrip,
    refetchBookingsRef: state.refetchBookingsRef,
    refetchBookings: state.refetchBookings,
    presentedManageAutoProgressKeysRef: state.presentedManageAutoProgressKeysRef,
    highestManageAutoProgressPriorityRef: state.highestManageAutoProgressPriorityRef,
    lastManageDriverLocationSentAtRef: state.lastManageDriverLocationSentAtRef,
    tripId: state.tripId,
    isOwner: state.isOwner,
    trip: trip,
    lastKnownLocation: state.lastKnownLocation,
  });

  const openTripSecurityModal = () => {
    state.setSecurityModalVisible(true);
  };

  const closeTripSecurityModal = () => {
    state.setSecurityModalVisible(false);
  };

  const bookingsActions = useManageTripBookingActions({
    setFeedback: state.setFeedback,
    setTargetBooking: state.setTargetBooking,
    setRejectReason: state.setRejectReason,
    setRejectError: state.setRejectError,
    setRejectModalVisible: state.setRejectModalVisible,
    isRejecting: state.isRejecting,
    setProcessingBookingId: state.setProcessingBookingId,
    acceptBooking: state.acceptBooking,
    rememberAcceptedBooking,
    trip: trip,
    refreshAll,
    reconcileBookingStatus,
    targetBooking: state.targetBooking,
    rejectReason: state.rejectReason,
    rejectBooking: state.rejectBooking,
    showDialog: state.showDialog,
    cancelBooking: state.cancelBooking,
  });

  const routeEditor = useManageTripRouteEditor({
    trip: trip,
    setEditDepartureAddress: state.setEditDepartureAddress,
    setEditArrivalAddress: state.setEditArrivalAddress,
    setEditRouteError: state.setEditRouteError,
    setEditRouteModalVisible: state.setEditRouteModalVisible,
    isSavingRoute: state.isSavingRoute,
    geocodeManualAddress: state.geocodeManualAddress,
    editDepartureAddress: state.editDepartureAddress,
    editArrivalAddress: state.editArrivalAddress,
    setIsResolvingRoute: state.setIsResolvingRoute,
    updateTripRoute: state.updateTripRoute,
    showFeedback: bookingsActions.showFeedback,
    refreshAll,
  });

  // Calculate arrival coordinate for canCompleteTrip
  const arrivalCoordinate = useMemo(
    () =>
      getTripLocationCoordinate({
        lat: trip?.arrival?.lat,
        lng: trip?.arrival?.lng,
        hasCoordinates: trip?.arrival?.hasCoordinates,
      }),
    [trip?.arrival?.hasCoordinates, trip?.arrival?.lat, trip?.arrival?.lng],
  );

  const actions = useManageTripActions({
    trip: trip,
    showDialog: state.showDialog,
    startTrip: state.startTrip,
    showFeedback: bookingsActions.showFeedback,
    refreshAll,
    reconcileTripStatus,
    pauseTrip: state.pauseTrip,
    requestDriverTripInterruption: state.requestDriverTripInterruption,
    lastKnownLocation: state.lastKnownLocation,
    visibleBookings: tracking.visibleBookings,
    router: state.router,
    updateTripStatus: state.updateTripStatus,
    goHome: state.goHome,
  });

  // Vérifier si l'arrivée de tous les passagers est confirmée
  const allPassengersDroppedOff = useMemo(() => {
    if (!tracking.visibleBookings || tracking.visibleBookings.length === 0) return true;
    const acceptedBookings = tracking.visibleBookings.filter((booking) => booking.status === 'accepted');
    if (acceptedBookings.length === 0) return true;
    return acceptedBookings.every(
      (booking) => booking.droppedOff && booking.droppedOffConfirmedByPassenger,
    );
  }, [tracking.visibleBookings]);

  const tripStatus = trip?.status;
  const tripCurrentLocation = trip?.currentLocation;

  // Vérifier si le conducteur est arrivé à destination (distance < 100m)
  const isAtDestination = useMemo(() => {
    if (!arrivalCoordinate || tripStatus !== 'ongoing') return false;
    
    // Obtenir la position actuelle du conducteur
    const currentCoordinate = getGeoPointCoordinate(tripCurrentLocation);

    if (!currentCoordinate) return false;

    // Calculer la distance en kilomètres
    const distanceKm = calculateDistance(currentCoordinate, arrivalCoordinate);
    // Convertir en mètres et vérifier si < 100m
    const distanceMeters = distanceKm * 1000;
    return distanceMeters < 100; // 100 mètres de tolérance
  }, [arrivalCoordinate, tripCurrentLocation, tripStatus]);

  // Le statut de finalisation automatique apparait si :
  // - Le trajet est en cours
  // - L'arrivée de tous les passagers est confirmée
  // - Le conducteur est arrivé à destination
  const canCompleteTrip = trip?.status === 'ongoing' && allPassengersDroppedOff && isAtDestination;

  // console.log("this user is owner", isOwner);
  // console.log("this user is", user);

  const pendingBookings = (tracking.visibleBookings ?? []).filter((booking) => booking.status === 'pending');

  return {
    state,
    trip,
    refreshAll,
    routeEditor,
    tracking,
    actions,
    bookingsActions,
    openTripSecurityModal,
    canCompleteTrip,
    closeTripSecurityModal,
  };
}
