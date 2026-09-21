import { useRideNotice } from '@/hooks/navigation/useRideNotice';
import { useDriverNavigationFoundation } from './useDriverNavigationFoundation';
import { useDriverMapPerspective } from './useDriverMapPerspective';
import { useDriverLocationEmission } from './useDriverLocationEmission';
import { useDriverBookingProgressSync } from './useDriverBookingProgressSync';
import { useDriverTrackingSocket } from './useDriverTrackingSocket';
import { useDriverProgressLifecycle } from './useDriverProgressLifecycle';
import { useDriverLocationTracking } from './useDriverLocationTracking';
import { useDriverNavigationNotices } from './useDriverNavigationNotices';
import { useDriverForegroundCompletion } from './useDriverForegroundCompletion';
import { useDriverCompletionActions } from './useDriverCompletionActions';



export function useDriverNavigationSession() {
  const foundation = useDriverNavigationFoundation();
  const showNotice = useRideNotice(`driver:${foundation.data.tripId}`, foundation.data.isScreenActive);

  const notices = useDriverNavigationNotices({
    isMountedRef: foundation.mapState.isMountedRef,
    waypointModalVisibleRef: foundation.refs.waypointModalVisibleRef,
    pickupBypassConfirmationRef: foundation.mapState.pickupBypassConfirmationRef,
    presentedWaypointIdsRef: foundation.refs.presentedWaypointIdsRef,
    setActiveWaypoint: foundation.mapState.setActiveWaypoint,
    setWaypointModalVisible: foundation.mapState.setWaypointModalVisible,
    presentedPickupNoticeKeysRef: foundation.refs.presentedPickupNoticeKeysRef,
    highestPickupNoticePriorityRef: foundation.refs.highestPickupNoticePriorityRef,
    pickupNoticeRef: foundation.mapState.pickupNoticeRef,
    setPickupNotice: foundation.mapState.setPickupNotice,
    visibleBookings: foundation.passengers.visibleBookings,
    presentedPassengerBoardedKeysRef: foundation.refs.presentedPassengerBoardedKeysRef,
    setPickupNoticeCountdown: foundation.mapState.setPickupNoticeCountdown,
    setPickupBypassConfirmation: foundation.mapState.setPickupBypassConfirmation,
    setPickupBypassAction: foundation.mapState.setPickupBypassAction,
    showDialog: showNotice,
    presentedPassengerDestinationKeysRef: foundation.refs.presentedPassengerDestinationKeysRef,
    presentedPassengerDestinationApproachKeysRef: foundation.refs.presentedPassengerDestinationApproachKeysRef,
  });

  const completion = useDriverCompletionActions({
    isMountedRef: foundation.mapState.isMountedRef,
    presentedTripDestinationKeysRef: foundation.refs.presentedTripDestinationKeysRef,
    showDialog: showNotice,
    tripEndNoticeRef: foundation.mapState.tripEndNoticeRef,
    setTripEndNotice: foundation.mapState.setTripEndNotice,
    getDriverTripRevenueSummary: foundation.data.getDriverTripRevenueSummary,
    tripArrivalCoordinate: foundation.data.tripArrivalCoordinate,
    currentLocationRef: foundation.refs.currentLocationRef,
    lastAcceptedDriverCoordinateRef: foundation.mapState.lastAcceptedDriverCoordinateRef,
    tripId: foundation.data.tripId,
    completedDuringInactiveCandidateRef: foundation.mapState.completedDuringInactiveCandidateRef,
    activeNavigationDestination: foundation.destination.activeNavigationDestination,
    routeCoordinatesRef: foundation.refs.routeCoordinatesRef,
    tripDepartureCoordinate: foundation.data.tripDepartureCoordinate,
    autoCompletingTripRef: foundation.refs.autoCompletingTripRef,
    trip: foundation.data.trip,
    completeTrip: foundation.data.completeTrip,
    reconcileTripStatus: foundation.data.reconcileTripStatus,
    refetchTrip: foundation.data.refetchTrip,
    refetchBookings: foundation.data.refetchBookings,
  });

  const foregroundCompletion = useDriverForegroundCompletion({
    tripId: foundation.data.tripId,
    trip: foundation.data.trip,
    tripArrivalCoordinate: foundation.data.tripArrivalCoordinate,
    isRestCompletionCheckRunningRef: foundation.mapState.isRestCompletionCheckRunningRef,
    lastRestCompletionCheckAtRef: foundation.mapState.lastRestCompletionCheckAtRef,
    refetchTrip: foundation.data.refetchTrip,
    refetchBookings: foundation.data.refetchBookings,
    bookingsRef: foundation.refs.bookingsRef,
    presentCompletedTripFromServerSync: completion.presentCompletedTripFromServerSync,
    completedDuringInactiveCandidateRef: foundation.mapState.completedDuringInactiveCandidateRef,
    lastAcceptedDriverTimestampRef: foundation.mapState.lastAcceptedDriverTimestampRef,
    getDriverLocationSnapshot: foundation.data.getDriverLocationSnapshot,
    isMountedRef: foundation.mapState.isMountedRef,
    lastTripCompletionCheckCoordinateRef: foundation.mapState.lastTripCompletionCheckCoordinateRef,
    lastAcceptedDriverCoordinateRef: foundation.mapState.lastAcceptedDriverCoordinateRef,
    tripDestinationNearSinceMsRef: foundation.refs.tripDestinationNearSinceMsRef,
    getTripDestinationReferenceRoute: completion.getTripDestinationReferenceRoute,
    currentLocationRef: foundation.refs.currentLocationRef,
    setCurrentLocation: foundation.mapState.setCurrentLocation,
    updateDriverLocation: foundation.data.updateDriverLocation,
    tryCompleteTripFromNavigation: completion.tryCompleteTripFromNavigation,
    appStateRef: foundation.mapState.appStateRef,
  });

  useDriverProgressLifecycle({
    mapState: foundation.mapState,
    foregroundCompletion,
    data: foundation.data,
    refs: foundation.refs,
    completion,
  });

  // Connexion WebSocket pour le tracking temps réel
  useDriverTrackingSocket({
    data: foundation.data,
    mapState: foundation.mapState,
    completion,
    notices,
    refs: foundation.refs,
  });
  // Créer les waypoints à partir des bookings acceptés
  useDriverBookingProgressSync({
    passengers: foundation.passengers,
    data: foundation.data,
    refs: foundation.refs,
    mapState: foundation.mapState,
  });

  const locationEmission = useDriverLocationEmission({
    data: foundation.data,
    mapState: foundation.mapState,
    refs: foundation.refs,
  });

  // Demander les permissions de localisation
  useDriverLocationTracking({
    data: foundation.data,
    mapState: foundation.mapState,
    refs: foundation.refs,
    exitActions: foundation.exitActions,
    promptBackgroundDisclosure: foundation.promptBackgroundDisclosure,
    sendDriverLocationToTracking: locationEmission.sendDriverLocationToTracking,
  });

  // Passer la carte en 3D lorsque la course est en cours
  useDriverMapPerspective({
    data: foundation.data,
    mapState: foundation.mapState,
    refs: foundation.refs,
  });

  return {
    foundation,
    notices,
    completion,
  };
}
