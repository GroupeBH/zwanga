import { useDriverNavigationSession } from './useDriverNavigationSession';
import { useDriverPassengerPresentation } from './useDriverPassengerPresentation';
import { useDriverNavigationPresentation } from './useDriverNavigationPresentation';
import { useDriverRouteContext } from './useDriverRouteContext';
import { useDriverRouteProgressTracking } from './useDriverRouteProgressTracking';
import { useDriverNavigationStepProgress } from './useDriverNavigationStepProgress';
import { useDriverNavigationRoute } from './useDriverNavigationRoute';
import { useDriverRouteFormatting } from './useDriverRouteFormatting';
import { useDriverVoiceGuidance } from './useDriverVoiceGuidance';
import { useDriverPickupActions } from './useDriverPickupActions';
import { useDriverTripActions } from './useDriverTripActions';
import { useDriverTripInterruptionActions } from './useDriverTripInterruptionActions';
import { useDriverNavigationExitPrompt } from './useDriverNavigationExitPrompt';
import { useDriverBookingActions } from './useDriverBookingActions';
import { useCallback } from 'react';



export function useDriverNavigationController() {
  const session = useDriverNavigationSession();

  const voice = useDriverVoiceGuidance({
    isMountedRef: session.foundation.mapState.isMountedRef,
    isTripOngoingRef: session.foundation.mapState.isTripOngoingRef,
    isVoiceGuidanceEnabledRef: session.foundation.refs.isVoiceGuidanceEnabledRef,
    lastSpeechAtRef: session.foundation.refs.lastSpeechAtRef,
    waypointModalVisible: session.foundation.mapState.waypointModalVisible,
    activeWaypoint: session.foundation.mapState.activeWaypoint,
    announcedWaypointIdsRef: session.foundation.refs.announcedWaypointIdsRef,
    spokenInstructionKeysRef: session.foundation.refs.spokenInstructionKeysRef,
    setIsVoiceGuidanceEnabled: session.foundation.mapState.setIsVoiceGuidanceEnabled,
    steps: session.foundation.mapState.steps,
    currentStepIndex: session.foundation.mapState.currentStepIndex,
    isTripOngoing: session.foundation.data.isTripOngoing,
    isLoadingRoute: session.foundation.mapState.isLoadingRoute,
  });

  // Décoder un polyline Google (avec simplification pour économiser la mémoire)
  const routeFormatting = useDriverRouteFormatting();
  // Récupérer l'itinéraire depuis Google Directions API (une seule fois au démarrage et quand les waypoints changent)
  const routeContext = useDriverRouteContext({
    refs: session.foundation.refs,
    data: session.foundation.data,
    activeRouteDestination: session.foundation.destination.activeRouteDestination,
    mapState: session.foundation.mapState,
    activeNavigationDestination: session.foundation.destination.activeNavigationDestination,
  });

  const routeQuery = useDriverNavigationRoute({
    trip: session.foundation.data.trip,
    tripDepartureCoordinate: session.foundation.data.tripDepartureCoordinate,
    activeRouteDestination: session.foundation.destination.activeRouteDestination,
    isMountedRef: session.foundation.mapState.isMountedRef,
    isKinshasaNavigationTrip: session.foundation.data.isKinshasaNavigationTrip,
    tripId: session.foundation.data.tripId,
    tripArrivalCoordinate: session.foundation.data.tripArrivalCoordinate,
    activeNavigationDestination: session.foundation.destination.activeNavigationDestination,
    beginRouteRequest: session.foundation.data.beginRouteRequest,
    routeSignature: routeContext.routeSignature,
    routeFetchedRef: session.foundation.refs.routeFetchedRef,
    lastRouteFetchTimeRef: session.foundation.refs.lastRouteFetchTimeRef,
    setIsLoadingRoute: session.foundation.mapState.setIsLoadingRoute,
    setIsReroutingRoute: session.foundation.mapState.setIsReroutingRoute,
    getDirections: session.foundation.data.getDirections,
    decodePolyline: routeFormatting.decodePolyline,
    isTripOngoing: session.foundation.data.isTripOngoing,
    setRouteCoordinates: session.foundation.mapState.setRouteCoordinates,
    setRouteDistanceMeters: session.foundation.mapState.setRouteDistanceMeters,
    setRouteDurationSeconds: session.foundation.mapState.setRouteDurationSeconds,
    setTotalDistance: session.foundation.mapState.setTotalDistance,
    setTotalDuration: session.foundation.mapState.setTotalDuration,
    currentLegIndex: session.foundation.mapState.currentLegIndex,
    stepsRef: session.foundation.refs.stepsRef,
    currentStepIndexRef: session.foundation.refs.currentStepIndexRef,
    setSteps: session.foundation.mapState.setSteps,
    setCurrentStepIndex: session.foundation.mapState.setCurrentStepIndex,
    speakNavigationMessage: voice.speakNavigationMessage,
    buildInstructionSpeech: voice.buildInstructionSpeech,
    focusMapOnCoordinates: session.foundation.focusMapOnCoordinates,
    routeCoordinatesRef: session.foundation.refs.routeCoordinatesRef,
  });

  // Mettre à jour l'étape actuelle en fonction de la position
  session.foundation.refs.fetchRouteRef.current = routeQuery.fetchRoute;

  const stepProgress = useDriverNavigationStepProgress({
    stepsRef: session.foundation.refs.stepsRef,
    waypointsRef: session.foundation.refs.waypointsRef,
    currentWaypointIndexRef: session.foundation.refs.currentWaypointIndexRef,
    currentStepIndexRef: session.foundation.refs.currentStepIndexRef,
    isMountedRef: session.foundation.mapState.isMountedRef,
    announcedWaypointIdsRef: session.foundation.refs.announcedWaypointIdsRef,
    speakNavigationMessage: voice.speakNavigationMessage,
    buildWaypointSpeech: voice.buildWaypointSpeech,
    presentPickupNotice: session.notices.presentPickupNotice,
    tripId: session.foundation.data.tripId,
    presentWaypointModal: session.notices.presentWaypointModal,
    setCurrentStepIndex: session.foundation.mapState.setCurrentStepIndex,
  });
  session.foundation.refs.updateCurrentStepRef.current = stepProgress.updateCurrentStep;



  useDriverRouteProgressTracking({
    data: session.foundation.data,
    refs: session.foundation.refs,
    mapState: session.foundation.mapState,
    activeNavigationDestination: session.foundation.destination.activeNavigationDestination,
    notices: session.notices,
    completion: session.completion,
  });

  // Forcer le recalcul de l'itinéraire
  const forceRecalculateRoute = () => {
    session.foundation.refs.lastRouteFetchTimeRef.current = 0; // Reset le timestamp
    session.foundation.refs.routeFetchedRef.current = false; // Permettre un nouveau fetch
    session.foundation.refs.routeSignatureRef.current = '';
    if (session.foundation.data.trip && session.foundation.data.tripDepartureCoordinate && session.foundation.destination.activeRouteDestination) {
      const originOverride = session.foundation.data.isTripOngoing ? routeContext.getFreshDriverCoordinate() ?? undefined : undefined;
      routeQuery.fetchRoute({ originOverride });
    }
  };

  const bookingActions = useDriverBookingActions({
    setProcessingBookingId: session.foundation.mapState.setProcessingBookingId,
    acceptBooking: session.foundation.data.acceptBooking,
    rememberAcceptedBooking: session.foundation.passengers.rememberAcceptedBooking,
    lastRouteFetchTimeRef: session.foundation.refs.lastRouteFetchTimeRef,
    routeFetchedRef: session.foundation.refs.routeFetchedRef,
    refetchBookings: session.foundation.data.refetchBookings,
    refetchTrip: session.foundation.data.refetchTrip,
    speakNavigationMessage: voice.speakNavigationMessage,
    reconcileBookingStatus: session.foundation.data.reconcileBookingStatus,
    showDialog: session.foundation.data.showDialog,
    rejectBooking: session.foundation.data.rejectBooking,
    isConfirmingPassengerInterruption: session.foundation.data.isConfirmingPassengerInterruption,
    confirmPassengerTripInterruption: session.foundation.data.confirmPassengerTripInterruption,
    routeSignatureRef: session.foundation.refs.routeSignatureRef,
    isRejectingPassengerInterruption: session.foundation.data.isRejectingPassengerInterruption,
    rejectPassengerTripInterruption: session.foundation.data.rejectPassengerTripInterruption,
  });

  const passengerPresentation = useDriverPassengerPresentation({
    passengers: session.foundation.passengers,
    refs: session.foundation.refs,
    mapState: session.foundation.mapState,
    focusMapOnCoordinates: session.foundation.focusMapOnCoordinates,
  });

  // Fermer le modal de waypoint sans confirmer
  const pickupActions = useDriverPickupActions({
    waypointModalVisibleRef: session.foundation.refs.waypointModalVisibleRef,
    setWaypointModalVisible: session.foundation.mapState.setWaypointModalVisible,
    setActiveWaypoint: session.foundation.mapState.setActiveWaypoint,
    tripId: session.foundation.data.tripId,
    router: session.foundation.data.router,
    activeWaypoint: session.foundation.mapState.activeWaypoint,
    pickupNoticeRef: session.foundation.mapState.pickupNoticeRef,
    setPickupNotice: session.foundation.mapState.setPickupNotice,
    setPickupNoticeCountdown: session.foundation.mapState.setPickupNoticeCountdown,
    tripEndNoticeRef: session.foundation.mapState.tripEndNoticeRef,
    setTripEndNotice: session.foundation.mapState.setTripEndNotice,
    pickupBypassConfirmationRef: session.foundation.mapState.pickupBypassConfirmationRef,
    setPickupBypassConfirmation: session.foundation.mapState.setPickupBypassConfirmation,
    setPickupBypassAction: session.foundation.mapState.setPickupBypassAction,
    lastRouteFetchTimeRef: session.foundation.refs.lastRouteFetchTimeRef,
    routeFetchedRef: session.foundation.refs.routeFetchedRef,
    routeSignatureRef: session.foundation.refs.routeSignatureRef,
    offRouteSampleCountRef: session.foundation.refs.offRouteSampleCountRef,
    lastOffRouteRerouteAtRef: session.foundation.refs.lastOffRouteRerouteAtRef,
    pickupBypassAction: session.foundation.mapState.pickupBypassAction,
    setProcessingBookingId: session.foundation.mapState.setProcessingBookingId,
    speakNavigationMessage: voice.speakNavigationMessage,
    showDialog: session.foundation.data.showDialog,
    cancelBooking: session.foundation.data.cancelBooking,
    rememberCancelledBooking: session.foundation.passengers.rememberCancelledBooking,
    setPickupSkipped: session.foundation.passengers.setPickupSkipped,
    refetchBookings: session.foundation.data.refetchBookings,
    refetchTrip: session.foundation.data.refetchTrip,
    reconcileBookingStatus: session.foundation.data.reconcileBookingStatus,
  });

  const handleRatePassengersFromTripEnd = useCallback(() => {
    if (!session.foundation.data.tripId) {
      return;
    }

    pickupActions.dismissTripEndNotice();
    session.foundation.mapState.navigateAfterRelease(() => session.foundation.data.router.replace(`/rate/${session.foundation.data.tripId}`));
  }, [pickupActions.dismissTripEndNotice, session.foundation.mapState.navigateAfterRelease, session.foundation.data.router, session.foundation.data.tripId]);

  const handleExitNavigation = useDriverNavigationExitPrompt({
    status: session.foundation.data.trip?.status,
    interruptionPending: Boolean(session.foundation.passengers.activeDriverInterruptionRequest),
    navigateBackSafely: session.foundation.exitActions.navigateBackSafely,
    showDialog: session.foundation.data.showDialog,
  });

  const interruptionActions = useDriverTripInterruptionActions({
    isScreenActive: session.foundation.data.isScreenActive,
    navigateBackSafely: session.foundation.exitActions.navigateBackSafely,
    isExitingRef: session.foundation.refs.isExitingRef,
    tripId: session.foundation.data.tripId,
    isRestartingTrip: session.foundation.data.isRestartingTrip,
    isTripFetching: session.foundation.data.isTripFetching,
    startTrip: session.foundation.data.startTrip,
    lastRouteFetchTimeRef: session.foundation.refs.lastRouteFetchTimeRef,
    routeFetchedRef: session.foundation.refs.routeFetchedRef,
    routeSignatureRef: session.foundation.refs.routeSignatureRef,
    hasFetchedInitialDriverRouteRef: session.foundation.refs.hasFetchedInitialDriverRouteRef,
    offRouteSampleCountRef: session.foundation.refs.offRouteSampleCountRef,
    lastOffRouteRerouteAtRef: session.foundation.refs.lastOffRouteRerouteAtRef,
    setRouteCoordinates: session.foundation.mapState.setRouteCoordinates,
    setRouteDistanceMeters: session.foundation.mapState.setRouteDistanceMeters,
    setRouteDurationSeconds: session.foundation.mapState.setRouteDurationSeconds,
    setSteps: session.foundation.mapState.setSteps,
    setCurrentStepIndex: session.foundation.mapState.setCurrentStepIndex,
    refetchTrip: session.foundation.data.refetchTrip,
    refetchBookings: session.foundation.data.refetchBookings,
    showDialog: session.foundation.data.showDialog,
    reconcileTripStatus: session.foundation.data.reconcileTripStatus,
    pauseTrip: session.foundation.data.pauseTrip,
    locationSubscription: session.foundation.mapState.locationSubscription,
    currentLocationRef: session.foundation.refs.currentLocationRef,
    setIsSocketConnected: session.foundation.mapState.setIsSocketConnected,
    setLivePassengerLocations: session.foundation.mapState.setLivePassengerLocations,
    cleanupNavigationUi: session.foundation.exitActions.cleanupNavigationUi,
    requestDriverTripInterruption: session.foundation.data.requestDriverTripInterruption,
  });

  const tripActions = useDriverTripActions({
    tripId: session.foundation.data.tripId,
    isPausingTrip: session.foundation.data.isPausingTrip,
    isRequestingDriverInterruption: session.foundation.data.isRequestingDriverInterruption,
    isCancellingDriverInterruption: session.foundation.data.isCancellingDriverInterruption,
    activeDriverInterruptionRequest: session.foundation.passengers.activeDriverInterruptionRequest,
    showDialog: session.foundation.data.showDialog,
    activeDriverInterruptionConfirmedCount: session.foundation.passengers.activeDriverInterruptionConfirmedCount,
    activeDriverInterruptionRequiredCount: session.foundation.passengers.activeDriverInterruptionRequiredCount,
    cancelDriverTripInterruption: session.foundation.data.cancelDriverTripInterruption,
    refetchTrip: session.foundation.data.refetchTrip,
    refetchBookings: session.foundation.data.refetchBookings,
    bookingsRef: session.foundation.refs.bookingsRef,
    pauseTripWithoutPassengerConfirmation: interruptionActions.pauseTripWithoutPassengerConfirmation,
    sendDriverInterruptionRequest: interruptionActions.sendDriverInterruptionRequest,
    createTripShareLink: session.foundation.data.createTripShareLink,
    trip: session.foundation.data.trip,
    cleanupNavigationUi: session.foundation.exitActions.cleanupNavigationUi,
    navigateAfterRelease: session.foundation.mapState.navigateAfterRelease,
    router: session.foundation.data.router,
    isFocused: session.foundation.data.isFocused,
    securityModalVisible: session.foundation.mapState.securityModalVisible,
    setSecurityModalVisible: session.foundation.mapState.setSecurityModalVisible,
    handleExitNavigation,
  });

  // Vérifier que le trip est chargé et a des coordonnées valides
  const presentation = useDriverNavigationPresentation({
    data: session.foundation.data,
    mapState: session.foundation.mapState,
    activeNavigationDestination: session.foundation.destination.activeNavigationDestination,
    activeRouteDestination: session.foundation.destination.activeRouteDestination,
  });

  return {
    session,
    presentation,
    interruptionActions,
    handleExitNavigation,
    passengerPresentation,
    bookingActions,
    routeFormatting,
    tripActions,
    voice,
    forceRecalculateRoute,
    pickupActions,
    handleRatePassengersFromTripEnd,
  };
}
