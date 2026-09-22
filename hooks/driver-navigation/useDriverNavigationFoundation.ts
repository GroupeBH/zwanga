import { useDriverNavigationDestination } from './useDriverNavigationDestination';
import { useDriverNavigationBookings } from './useDriverNavigationBookings';
import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationData } from './useDriverNavigationData';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import { useDriverNavigationExit } from './useDriverNavigationExit';
import { fitMapToSafeCoordinates } from '../../features/driver-navigation/navigationMap';
import { RouteCoordinate } from '../../features/driver-navigation/navigationModel';
import { useCallback } from 'react';



export function useDriverNavigationFoundation() {
  const data = useDriverNavigationData();

  const mapState = useDriverNavigationMapState({
    tripId: data.tripId,
    isScreenActive: data.isScreenActive,
    tripDepartureCoordinate: data.tripDepartureCoordinate,
  });

  const { runMapCommand, mapLayoutRef } = mapState;
  const focusMapOnCoordinates = useCallback(
    (
      coordinates: (RouteCoordinate | null | undefined)[],
      options: Parameters<typeof fitMapToSafeCoordinates>[2],
    ) => {
      runMapCommand((map) => fitMapToSafeCoordinates(map, coordinates, {
        ...options, layout: mapLayoutRef.current,
      }));
    },
    [runMapCommand, mapLayoutRef],
  );

  const refs = useDriverNavigationRefs({
    trip: data.trip,
  });

  const passengers = useDriverNavigationBookings({
    setLocallyAcceptedBookingIds: mapState.setLocallyAcceptedBookingIds,
    setLocallyPickedUpBookingIds: mapState.setLocallyPickedUpBookingIds,
    setLocallyCancelledBookingIds: mapState.setLocallyCancelledBookingIds,
    setSkippedPickupBookingIds: mapState.setSkippedPickupBookingIds,
    skippedPickupBookingIdsRef: refs.skippedPickupBookingIdsRef,
    bookings: data.bookings,
    locallyAcceptedBookingIds: mapState.locallyAcceptedBookingIds,
    locallyPickedUpBookingIds: mapState.locallyPickedUpBookingIds,
    locallyCancelledBookingIds: mapState.locallyCancelledBookingIds,
    livePassengerLocations: mapState.livePassengerLocations,
    isKinshasaNavigationTrip: data.isKinshasaNavigationTrip,
    tripArrivalCoordinate: data.tripArrivalCoordinate,
    tripDepartureCoordinate: data.tripDepartureCoordinate,
    trip: data.trip,
    processingBookingId: mapState.processingBookingId,
  });

  const destination = useDriverNavigationDestination({
    refs,
    mapState,
    passengers,
    data,
  });

  const exitActions = useDriverNavigationExit({
    cancelRouteRequest: data.cancelRouteRequest,
    cancelLocationRequest: data.cancelLocationRequest,
    stopDriverMarkerAnimation: mapState.stopDriverMarkerAnimation,
    recalcRouteTimeoutRef: mapState.recalcRouteTimeoutRef,
    locationSubscription: mapState.locationSubscription,
    backgroundDisclosureResolverRef: mapState.backgroundDisclosureResolverRef,
    offRouteSampleCountRef: refs.offRouteSampleCountRef,
    isReroutingRef: refs.isReroutingRef,
    hasFetchedInitialDriverRouteRef: refs.hasFetchedInitialDriverRouteRef,
    autoCompletingTripRef: refs.autoCompletingTripRef,
    lastAcceptedDriverCoordinateRef: mapState.lastAcceptedDriverCoordinateRef,
    lastAcceptedDriverTimestampRef: mapState.lastAcceptedDriverTimestampRef,
    lastTripCompletionCheckCoordinateRef: mapState.lastTripCompletionCheckCoordinateRef,
    lastBackgroundCheckpointAtRef: mapState.lastBackgroundCheckpointAtRef,
    isRestCompletionCheckRunningRef: mapState.isRestCompletionCheckRunningRef,
    lastRestCompletionCheckAtRef: mapState.lastRestCompletionCheckAtRef,
    completedDuringInactiveCandidateRef: mapState.completedDuringInactiveCandidateRef,
    previousTripStatusRef: refs.previousTripStatusRef,
    skippedPickupBookingIdsRef: refs.skippedPickupBookingIdsRef,
    pickupClosestDistanceMetersRef: refs.pickupClosestDistanceMetersRef,
    presentedPickupBypassBookingIdsRef: refs.presentedPickupBypassBookingIdsRef,
    tripDestinationNearSinceMsRef: refs.tripDestinationNearSinceMsRef,
    setIsReroutingRoute: mapState.setIsReroutingRoute,
    setRouteDistanceMeters: mapState.setRouteDistanceMeters,
    setRouteDurationSeconds: mapState.setRouteDurationSeconds,
    setBackgroundDisclosureVisible: mapState.setBackgroundDisclosureVisible,
    setSecurityModalVisible: mapState.setSecurityModalVisible,
    setPickupNotice: mapState.setPickupNotice,
    setPickupNoticeCountdown: mapState.setPickupNoticeCountdown,
    pickupBypassConfirmationRef: mapState.pickupBypassConfirmationRef,
    setPickupBypassConfirmation: mapState.setPickupBypassConfirmation,
    setPickupBypassAction: mapState.setPickupBypassAction,
    tripEndNoticeRef: mapState.tripEndNoticeRef,
    setTripEndNotice: mapState.setTripEndNotice,
    waypointModalVisibleRef: refs.waypointModalVisibleRef,
    setWaypointModalVisible: mapState.setWaypointModalVisible,
    setPassengersPanelVisible: mapState.setPassengersPanelVisible,
    setActiveWaypoint: mapState.setActiveWaypoint,
    isExitingRef: refs.isExitingRef,
    navigateAfterRelease: mapState.navigateAfterRelease,
    tripId: data.tripId,
    router: data.router,
    isMountedRef: mapState.isMountedRef,
    isTripOngoingRef: mapState.isTripOngoingRef,
    isTripOngoing: data.isTripOngoing,
    isVoiceGuidanceEnabledRef: refs.isVoiceGuidanceEnabledRef,
    isVoiceGuidanceEnabled: mapState.isVoiceGuidanceEnabled,
    spokenInstructionKeysRef: refs.spokenInstructionKeysRef,
    announcedWaypointIdsRef: refs.announcedWaypointIdsRef,
    presentedWaypointIdsRef: refs.presentedWaypointIdsRef,
    lastSpeechAtRef: refs.lastSpeechAtRef,
    presentedPickupNoticeKeysRef: refs.presentedPickupNoticeKeysRef,
    highestPickupNoticePriorityRef: refs.highestPickupNoticePriorityRef,
    lastOffRouteRerouteAtRef: refs.lastOffRouteRerouteAtRef,
    routeSignatureRef: refs.routeSignatureRef,
    setSkippedPickupBookingIds: mapState.setSkippedPickupBookingIds,
    setLocallyAcceptedBookingIds: mapState.setLocallyAcceptedBookingIds,
    setLocallyPickedUpBookingIds: mapState.setLocallyPickedUpBookingIds,
    setLocallyCancelledBookingIds: mapState.setLocallyCancelledBookingIds,
    presentedPassengerBoardedKeysRef: refs.presentedPassengerBoardedKeysRef,
    presentedPassengerDestinationApproachKeysRef: refs.presentedPassengerDestinationApproachKeysRef,
    presentedPassengerDestinationKeysRef: refs.presentedPassengerDestinationKeysRef,
    presentedTripDestinationKeysRef: refs.presentedTripDestinationKeysRef,
  });

  const resolveBackgroundDisclosure = (accepted: boolean) => {
    mapState.setBackgroundDisclosureVisible(false);
    if (mapState.backgroundDisclosureResolverRef.current) {
      mapState.backgroundDisclosureResolverRef.current(accepted);
      mapState.backgroundDisclosureResolverRef.current = null;
    }
  };

  const promptBackgroundDisclosure = () =>
    new Promise<boolean>((resolve) => {
      mapState.backgroundDisclosureResolverRef.current = resolve;
      mapState.setBackgroundDisclosureVisible(true);
    });

  return {
    mapState,
    refs,
    passengers,
    data,
    destination,
    exitActions,
    promptBackgroundDisclosure,
    focusMapOnCoordinates,
    resolveBackgroundDisclosure,
  };
}
