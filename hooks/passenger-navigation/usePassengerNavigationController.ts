import { useRideNotice } from '@/hooks/navigation/useRideNotice';
import { usePassengerRouteContext } from './usePassengerRouteContext';
import { usePassengerDriverLocationSync } from './usePassengerDriverLocationSync';
import { usePassengerNavigationTracking } from './usePassengerNavigationTracking';
import { usePassengerLocationSharing } from './usePassengerLocationSharing';
import { usePassengerArrivalDetection } from './usePassengerArrivalDetection';
import { usePassengerDriverCameraTracking } from './usePassengerDriverCameraTracking';
import { usePassengerNavigationData } from './usePassengerNavigationData';
import { usePassengerNavigationState } from './usePassengerNavigationState';
import { usePassengerTripDestinationNotice } from './usePassengerTripDestinationNotice';
import { usePassengerNavigationPresentation } from './usePassengerNavigationPresentation';
import { usePassengerNavigationRoute } from './usePassengerNavigationRoute';
import { usePassengerNavigationCamera } from './usePassengerNavigationCamera';
import { usePassengerNavigationNotices } from './usePassengerNavigationNotices';
import { usePassengerNavigationCoordinates } from './usePassengerNavigationCoordinates';
import { usePassengerNavigationInterruption } from './usePassengerNavigationInterruption';
import { usePassengerNavigationTripActions } from './usePassengerNavigationTripActions';
import React, { useCallback } from 'react';
import type { MapMarker } from 'react-native-maps';



export function usePassengerNavigationController() {
  const data = usePassengerNavigationData();
  const showNotice = useRideNotice(`passenger:${data.bookingId}`, data.isScreenActive);

  const state = usePassengerNavigationState({
    bookingId: data.bookingId,
    isScreenActive: data.isScreenActive,
    isTripOngoing: data.isTripOngoing,
    insets: data.insets,
    router: data.router,
    isFocused: data.isFocused,
  });

  // Coordonnées importantes
  // Le point de récupération peut être personnalisé par le passager
  const coordinates = usePassengerNavigationCoordinates({
    trip: data.trip,
    booking: data.booking,
    bookingId: data.bookingId,
  });

  const context = usePassengerRouteContext({
    booking: data.booking,
    trip: data.trip,
    bookingId: data.bookingId,
    tripId: data.tripId,
    tripDepartureCoordinate: coordinates.tripDepartureCoordinate,
    tripArrivalCoordinate: coordinates.tripArrivalCoordinate,
    pickupCoordinate: coordinates.pickupCoordinate,
    dropoffCoordinate: coordinates.dropoffCoordinate,
    isTripOngoing: data.isTripOngoing,
    driverLocation: state.driverLocation,
    passengerLocation: state.passengerLocation,
  });

  const notices = usePassengerNavigationNotices({
    showNotice,
    isMountedRef: state.isMountedRef,
    hasPresentedArrivalModalRef: state.hasPresentedArrivalModalRef,
    refetchBooking: data.refetchBooking,
    hasPresentedNoShowNoticeRef: state.hasPresentedNoShowNoticeRef,
    setPickupNotice: state.setPickupNotice,
    setPickupNoticeCountdown: state.setPickupNoticeCountdown,
    showDialog: data.showDialog,
    hasPresentedBoardingUncertainNoticeRef: state.hasPresentedBoardingUncertainNoticeRef,
    passengerLocationSubscriptionRef: state.passengerLocationSubscriptionRef,
    bookingId: data.bookingId,
    navigateBackSafely: state.navigateBackSafely,
    booking: data.booking,
    presentedPickupNoticeKeysRef: state.presentedPickupNoticeKeysRef,
    highestPickupNoticePriorityRef: state.highestPickupNoticePriorityRef,
    hasDisplayedDriverNearNotificationRef: state.hasDisplayedDriverNearNotificationRef,
    hasPresentedBoardedNoticeRef: state.hasPresentedBoardedNoticeRef,
    hasPresentedDestinationApproachNoticeRef: state.hasPresentedDestinationApproachNoticeRef,
  });

  const destinationNotice = usePassengerTripDestinationNotice({
    isMountedRef: state.isMountedRef,
    hasPresentedTripCompletedNoticeRef: state.hasPresentedTripCompletedNoticeRef,
    hasPresentedTripDestinationApproachNoticeRef: state.hasPresentedTripDestinationApproachNoticeRef,
    showDialog: showNotice,
    pickupNotice: state.pickupNotice,
    setPickupNoticeCountdown: state.setPickupNoticeCountdown,
    hasPresentedArrivalModalRef: state.hasPresentedArrivalModalRef,
    hasDisplayedDriverNearNotificationRef: state.hasDisplayedDriverNearNotificationRef,
    hasPresentedBoardedNoticeRef: state.hasPresentedBoardedNoticeRef,
    hasPresentedDestinationApproachNoticeRef: state.hasPresentedDestinationApproachNoticeRef,
    hasPresentedNoShowNoticeRef: state.hasPresentedNoShowNoticeRef,
    hasPresentedBoardingUncertainNoticeRef: state.hasPresentedBoardingUncertainNoticeRef,
    hasObservedPickupStateRef: state.hasObservedPickupStateRef,
    previousPickupStateRef: state.previousPickupStateRef,
    lastAcceptedDriverCoordinateRef: state.lastAcceptedDriverCoordinateRef,
    lastAcceptedDriverTimestampRef: state.lastAcceptedDriverTimestampRef,
    lastAcceptedPassengerCoordinateRef: state.lastAcceptedPassengerCoordinateRef,
    lastAcceptedPassengerTimestampRef: state.lastAcceptedPassengerTimestampRef,
    routeSignatureRef: state.routeSignatureRef,
    routeFetchedRef: state.routeFetchedRef,
    lastRouteFetchRef: state.lastRouteFetchRef,
    presentedPickupNoticeKeysRef: state.presentedPickupNoticeKeysRef,
    highestPickupNoticePriorityRef: state.highestPickupNoticePriorityRef,
    setPickupNotice: state.setPickupNotice,
    bookingId: data.bookingId,
    booking: data.booking,
    presentBoardedNotice: notices.presentBoardedNotice,
  });

  const handleTrackingMarkerReady = useCallback(
    (markerKey: string, markerRef: React.MutableRefObject<MapMarker | null>) => {
      state.refreshTrackingMarker(markerKey, () => markerRef.current);
    },
    [state.refreshTrackingMarker],
  );

  usePassengerDriverLocationSync({
    trip: data.trip,
    lastUpdate: state.lastUpdate,
    driverLocation: state.driverLocation,
    lastAcceptedDriverCoordinateRef: state.lastAcceptedDriverCoordinateRef,
    lastAcceptedDriverTimestampRef: state.lastAcceptedDriverTimestampRef,
    setDriverLocation: state.setDriverLocation,
    setLastUpdate: state.setLastUpdate,
    driverLocationSnapshot: data.driverLocationSnapshot,
  });

  // Fonction pour récupérer la route
  const route = usePassengerNavigationRoute({
    routeOriginCoordinate: context.routeOriginCoordinate,
    activePassengerDestination: context.activePassengerDestination,
    isMountedRef: state.isMountedRef,
    isTripOngoing: data.isTripOngoing,
    driverLocation: state.driverLocation,
    hasPassengerPickedUp: context.hasPassengerPickedUp,
    setRouteCoordinates: state.setRouteCoordinates,
    setRouteInfo: state.setRouteInfo,
    routeFetchedRef: state.routeFetchedRef,
    lastRouteFetchRef: state.lastRouteFetchRef,
    beginRouteRequest: state.beginRouteRequest,
    passengerRouteSignature: context.passengerRouteSignature,
    setIsLoadingRoute: state.setIsLoadingRoute,
    getDirections: state.getDirections,
    routeCoordinates: state.routeCoordinates,
  });

  // Récupérer la route au chargement
  usePassengerNavigationTracking({
    isScreenActive: data.isScreenActive,
    routeFetchedRef: state.routeFetchedRef,
    setIsLoadingRoute: state.setIsLoadingRoute,
    routeSignatureRef: state.routeSignatureRef,
    passengerRouteSignature: context.passengerRouteSignature,
    lastRouteFetchRef: state.lastRouteFetchRef,
    trip: data.trip,
    fetchRoute: route.fetchRoute,
    tripId: data.tripId,
    isTripOngoing: data.isTripOngoing,
    setIsSocketConnected: state.setIsSocketConnected,
    isMountedRef: state.isMountedRef,
    lastAcceptedDriverCoordinateRef: state.lastAcceptedDriverCoordinateRef,
    lastAcceptedDriverTimestampRef: state.lastAcceptedDriverTimestampRef,
    setDriverLocation: state.setDriverLocation,
    setLastUpdate: state.setLastUpdate,
    bookingId: data.bookingId,
    presentPickupNotice: notices.presentPickupNotice,
    presentBoardedNotice: notices.presentBoardedNotice,
    presentNoShowNotice: notices.presentNoShowNotice,
    presentBoardingUncertainNotice: notices.presentBoardingUncertainNotice,
    presentDestinationApproachNotice: notices.presentDestinationApproachNotice,
    presentArrivalModal: notices.presentArrivalModal,
    presentTripDestinationNotice: destinationNotice.presentTripDestinationNotice,
    refetchBooking: data.refetchBooking,
    refetchTrip: data.refetchTrip,
  });

  usePassengerLocationSharing({
    booking: data.booking,
    isTripOngoing: data.isTripOngoing,
    passengerLocationSubscriptionRef: state.passengerLocationSubscriptionRef,
    isFocused: data.isFocused,
    isMountedRef: state.isMountedRef,
    isExitingRef: state.isExitingRef,
    isKinshasaTrip: coordinates.isKinshasaTrip,
    tripId: data.tripId,
    lastAcceptedPassengerCoordinateRef: state.lastAcceptedPassengerCoordinateRef,
    lastAcceptedPassengerTimestampRef: state.lastAcceptedPassengerTimestampRef,
    setPassengerLocation: state.setPassengerLocation,
    setRecoveryFix: state.setRecoveryFix,
    beginLocationRequest: state.beginLocationRequest,
    updatePassengerLocation: data.updatePassengerLocation,
    presentPickupNotice: notices.presentPickupNotice,
    presentBoardedNotice: notices.presentBoardedNotice,
    presentNoShowNotice: notices.presentNoShowNotice,
    presentBoardingUncertainNotice: notices.presentBoardingUncertainNotice,
    presentDestinationApproachNotice: notices.presentDestinationApproachNotice,
    presentArrivalModal: notices.presentArrivalModal,
    presentTripDestinationNotice: destinationNotice.presentTripDestinationNotice,
    refetchBooking: data.refetchBooking,
    refetchTrip: data.refetchTrip,
    showDialog: data.showDialog,
  });

  usePassengerArrivalDetection({
    passengerLocation: state.passengerLocation,
    dropoffCoordinate: coordinates.dropoffCoordinate,
    booking: data.booking,
    isTripOngoing: data.isTripOngoing,
    presentArrivalModal: notices.presentArrivalModal,
    presentNoShowNotice: notices.presentNoShowNotice,
    presentBoardingUncertainNotice: notices.presentBoardingUncertainNotice,
  });

  const driverCamera = usePassengerDriverCameraTracking({
    driverLocation: state.driverLocation,
    routeCoordinates: state.routeCoordinates,
    booking: data.booking,
    tripId: data.tripId,
    isTripOngoing: data.isTripOngoing,
    passengerLocation: state.passengerLocation,
    pickupCoordinate: coordinates.pickupCoordinate,
    presentPickupNotice: notices.presentPickupNotice,
  });

  // Calculer la region de la carte
  const camera = usePassengerNavigationCamera({
    passengerLocation: state.passengerLocation,
    displayedDriverLocation: driverCamera.displayedDriverLocation,
    pickupCoordinate: coordinates.pickupCoordinate,
    dropoffCoordinate: coordinates.dropoffCoordinate,
    runMapCommand: state.runMapCommand,
    mapLayoutRef: state.mapLayoutRef,
    booking: data.booking,
    routeCoordinates: state.routeCoordinates,
    isMapExpanded: state.isMapExpanded,
    isNativeMapReady: state.isNativeMapReady,
    hasFitInitialMapRef: state.hasFitInitialMapRef,
  });

  const tripActions = usePassengerNavigationTripActions({
    tripId: data.tripId,
    createTripShareLink: data.createTripShareLink,
    booking: data.booking,
    trip: data.trip,
    showDialog: data.showDialog,
    cancelBooking: data.cancelBooking,
    passengerLocationSubscriptionRef: state.passengerLocationSubscriptionRef,
    setPickupNotice: state.setPickupNotice,
    setPickupNoticeCountdown: state.setPickupNoticeCountdown,
    refetchBooking: data.refetchBooking,
    refetchTrip: data.refetchTrip,
    navigateBackSafely: state.navigateBackSafely,
    isCancellingBooking: data.isCancellingBooking,
  });

  const interruption = usePassengerNavigationInterruption({
    booking: data.booking,
    trip: data.trip,
    requestPassengerTripInterruption: data.requestPassengerTripInterruption,
    passengerLocation: state.passengerLocation,
    refetchBooking: data.refetchBooking,
    refetchTrip: data.refetchTrip,
    showDialog: data.showDialog,
    isRequestingPassengerInterruption: data.isRequestingPassengerInterruption,
    tripId: data.tripId,
    confirmDriverTripInterruption: data.confirmDriverTripInterruption,
    rejectDriverTripInterruption: data.rejectDriverTripInterruption,
  });

  // État du trajet pour le passager
  const presentation = usePassengerNavigationPresentation({
    booking: data.booking,
    trip: data.trip,
    pickupNotice: state.pickupNotice,
    displayedDriverLocation: driverCamera.displayedDriverLocation,
    routeCoordinates: state.routeCoordinates,
    passengerLocation: state.passengerLocation,
    pickupCoordinate: coordinates.pickupCoordinate,
    isPassengerOnboard: context.isPassengerOnboard,
    routeOriginCoordinate: context.routeOriginCoordinate,
    activePassengerDestination: context.activePassengerDestination,
    routeInfo: state.routeInfo,
    activeRouteSegment: state.activeRouteSegment,
    setActiveRouteSegment: state.setActiveRouteSegment,
  });

  return {
    data,
    state,
    camera,
    context,
    handleTrackingMarkerReady,
    driverCamera,
    coordinates,
    presentation,
    route,
    tripActions,
    interruption,
  };
}
