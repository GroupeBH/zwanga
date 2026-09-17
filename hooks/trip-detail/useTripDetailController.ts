import { useTripDetailEditor } from './useTripDetailEditor';
import { useTripDetailTracking } from './useTripDetailTracking';
import { useTripDetailActivity } from './useTripDetailActivity';
import { useTripDetailData } from './useTripDetailData';
import { useTripDetailBookingState } from './useTripDetailBookingState';
import { useTripDetailAccess } from './useTripDetailAccess';
import { useTripBookingPricing } from './useTripBookingPricing';
import { useTripBookingLocationForm } from './useTripBookingLocationForm';
import { useTripBookingWizard } from './useTripBookingWizard';
import { useTripDetailPresentation } from './useTripDetailPresentation';
import { useTripDetailMapPresentation } from './useTripDetailMapPresentation';
import { useTripDetailRouteCoordinates } from './useTripDetailRouteCoordinates';
import { useTripDetailSafetyActions } from './useTripDetailSafetyActions';
import { useTripDetailProgressNotices } from './useTripDetailProgressNotices';
import { useTripBookingSubmission } from './useTripBookingSubmission';
import { useTripBookingPayment } from './useTripBookingPayment';
import { useTripDetailContactActions } from './useTripDetailContactActions';
import { Colors } from '@/constants/styles';



export function useTripDetailController() {
  const data = useTripDetailData();
  const editing = useTripDetailEditor({
    data,
  });

  const bookingState = useTripDetailBookingState({
    trip: data.trip,
    isFocused: data.isFocused,
    tripId: data.tripId,
  });

  const activity = useTripDetailActivity({
    isScreenActive: data.isScreenActive,
    setRefreshing: bookingState.setRefreshing,
    refetchTrip: data.refetchTrip,
    refetchMyBookings: data.refetchMyBookings,
    refetchTripBookings: data.refetchTripBookings,
    refetchKycStatus: bookingState.refetchKycStatus,
    driverReviews: bookingState.driverReviews,
    driverAverageData: bookingState.driverAverageData,
    trip: data.trip,
    presentedTripDetailAutoProgressKeysRef: data.presentedTripDetailAutoProgressKeysRef,
    highestTripDetailAutoProgressPriorityRef: data.highestTripDetailAutoProgressPriorityRef,
    tripDetailBookingStateRef: data.tripDetailBookingStateRef,
    tripId: data.tripId,
    shouldShowTripGuide: bookingState.shouldShowTripGuide,
    setTripGuideVisible: bookingState.setTripGuideVisible,
    completeTripGuide: bookingState.completeTripGuide,
    isTripDriver: data.isTripDriver,
    stopWatchingRef: data.stopWatchingRef,
    requestLocationRef: data.requestLocationRef,
    myBookings: data.myBookings,
    user: data.user,
    trackParam: data.trackParam,
  });

  const progressNotices = useTripDetailProgressNotices({
    tripBookings: data.tripBookings,
    myBookings: data.myBookings,
    trip: data.trip,
    user: data.user,
    isTripDriver: data.isTripDriver,
    presentedTripDetailAutoProgressKeysRef: data.presentedTripDetailAutoProgressKeysRef,
    showDialog: data.showDialog,
    activeBooking: activity.activeBooking,
    bookingForTrip: activity.bookingForTrip,
    highestTripDetailAutoProgressPriorityRef: data.highestTripDetailAutoProgressPriorityRef,
  });

  useTripDetailTracking({
    isScreenActive: data.isScreenActive,
    trip: data.trip,
    canTrackTrip: activity.canTrackTrip,
    isTripDriver: data.isTripDriver,
    tripBookings: data.tripBookings,
    activeBooking: activity.activeBooking,
    bookingForTrip: activity.bookingForTrip,
    tripDetailBookingStateRef: data.tripDetailBookingStateRef,
    presentTripDetailAutoProgressEvent: progressNotices.presentTripDetailAutoProgressEvent,
    setTrackingError: data.setTrackingError,
    setLiveDriverUpdatedAt: data.setLiveDriverUpdatedAt,
    setLiveDriverCoordinate: data.setLiveDriverCoordinate,
    refetchTrip: data.refetchTrip,
    refetchMyBookings: data.refetchMyBookings,
    refetchTripBookings: data.refetchTripBookings,
    lastKnownLocation: data.lastKnownLocation,
  });

  const access = useTripDetailAccess({
    trip: data.trip,
    setBookingModalVisible: bookingState.setBookingModalVisible,
    liveDriverCoordinate: data.liveDriverCoordinate,
    trackingError: data.trackingError,
    isTripDriver: data.isTripDriver,
    liveDriverUpdatedAt: data.liveDriverUpdatedAt,
    activeBooking: activity.activeBooking,
    user: data.user,
    bookingForTrip: activity.bookingForTrip,
  });
  const bookingLocation = useTripBookingLocationForm({
    lastKnownLocation: data.lastKnownLocation,
    trip: data.trip,
    passengerOrigin: bookingState.passengerOrigin,
    passengerOriginManualAddress: bookingState.passengerOriginManualAddress,
    passengerDestination: bookingState.passengerDestination,
    passengerDestinationManualAddress: bookingState.passengerDestinationManualAddress,
    isIdentityVerified: data.isIdentityVerified,
    checkIdentity: data.checkIdentity,
    setBookingSeats: bookingState.setBookingSeats,
    setBookingPaymentMode: bookingState.setBookingPaymentMode,
    setBookingModalError: bookingState.setBookingModalError,
    setPassengerOrigin: bookingState.setPassengerOrigin,
    setPassengerOriginManualAddress: bookingState.setPassengerOriginManualAddress,
    setPassengerDestination: bookingState.setPassengerDestination,
    setPassengerDestinationManualAddress: bookingState.setPassengerDestinationManualAddress,
    setShouldAutofillPassengerOrigin: bookingState.setShouldAutofillPassengerOrigin,
    setBookingStep: bookingState.setBookingStep,
    setBookingModalVisible: bookingState.setBookingModalVisible,
    requestDriverLocationPermission: data.requestDriverLocationPermission,
  });

  const safety = useTripDetailSafetyActions({
    sosModalTimerRef: bookingState.sosModalTimerRef,
    setIsDetailMapReady: bookingState.setIsDetailMapReady,
    setSosModalVisible: bookingState.setSosModalVisible,
    isFocused: data.isFocused,
    securityModalVisible: bookingState.securityModalVisible,
    canAccessTripSecurity: access.canAccessTripSecurity,
    showDialog: data.showDialog,
    refetchTrip: data.refetchTrip,
    refetchMyBookings: data.refetchMyBookings,
    refetchTripBookings: data.refetchTripBookings,
    securityModalTransitionRef: bookingState.securityModalTransitionRef,
    securityModalTimerRef: bookingState.securityModalTimerRef,
    setSecurityModalVisible: bookingState.setSecurityModalVisible,
  });

  const wizard = useTripBookingWizard({
    isBooking: bookingState.isBooking,
    setBookingModalVisible: bookingState.setBookingModalVisible,
    setBookingStep: bookingState.setBookingStep,
    setShouldAutofillPassengerOrigin: bookingState.setShouldAutofillPassengerOrigin,
    setPassengerOriginManualAddress: bookingState.setPassengerOriginManualAddress,
    setPassengerDestinationManualAddress: bookingState.setPassengerDestinationManualAddress,
    setShowOriginPicker: bookingState.setShowOriginPicker,
    setShowDestinationPicker: bookingState.setShowDestinationPicker,
    bookingModalVisible: bookingState.bookingModalVisible,
    shouldAutofillPassengerOrigin: bookingState.shouldAutofillPassengerOrigin,
    passengerOrigin: bookingState.passengerOrigin,
    defaultPassengerOriginSelection: bookingLocation.defaultPassengerOriginSelection,
    setPassengerOrigin: bookingState.setPassengerOrigin,
    bookingStep: bookingState.bookingStep,
    bookingSeats: bookingState.bookingSeats,
    setBookingModalError: bookingState.setBookingModalError,
    seatLimit: access.seatLimit,
    isIdentityVerified: data.isIdentityVerified,
    setBookingSuccess: bookingState.setBookingSuccess,
    router: data.router,
  });

  const contact = useTripDetailContactActions({
    trip: data.trip,
    user: data.user,
    conversations: data.conversations,
    loadConversations: bookingState.loadConversations,
    createConversation: bookingState.createConversation,
    activeBooking: activity.activeBooking,
    router: data.router,
    showDialog: data.showDialog,
    isCreatingTripShareLink: bookingState.isCreatingTripShareLink,
    createTripShareLink: bookingState.createTripShareLink,
  });

  const payment = useTripBookingPayment({
    showDialog: data.showDialog,
    user: data.user,
    initiateBookingPayment: bookingState.initiateBookingPayment,
    refreshBookingLists: activity.refreshBookingLists,
    activeBooking: activity.activeBooking,
    isInitiatingBookingPayment: bookingState.isInitiatingBookingPayment,
  });

  const pricing = useTripBookingPricing({
    setBookingSeats: bookingState.setBookingSeats,
    seatLimit: access.seatLimit,
    setBookingModalError: bookingState.setBookingModalError,
    bookingSeats: bookingState.bookingSeats,
    trip: data.trip,
    activeBooking: activity.activeBooking,
  });

  const bookingSubmission = useTripBookingSubmission({
    isBooking: bookingState.isBooking,
    trip: data.trip,
    isValidatingDestination: bookingState.isValidatingDestination,
    bookingSeats: bookingState.bookingSeats,
    isIdentityVerified: data.isIdentityVerified,
    seatLimit: access.seatLimit,
    setBookingModalError: bookingState.setBookingModalError,
    setBookingStep: bookingState.setBookingStep,
    passengerOriginManualAddress: bookingState.passengerOriginManualAddress,
    passengerDestinationManualAddress: bookingState.passengerDestinationManualAddress,
    passengerOrigin: bookingState.passengerOrigin,
    passengerDestination: bookingState.passengerDestination,
    setIsValidatingDestination: bookingState.setIsValidatingDestination,
    resolveManualAddressSelection: editing.editRoute.resolveManualAddressSelection,
    setPassengerOrigin: bookingState.setPassengerOrigin,
    setPassengerDestination: bookingState.setPassengerDestination,
    routeCoordinates: bookingState.routeCoordinates,
    createBooking: bookingState.createBooking,
    estimatedTotal: pricing.estimatedTotal,
    bookingPaymentMode: bookingState.bookingPaymentMode,
    setBookingModalVisible: bookingState.setBookingModalVisible,
    setPassengerOriginManualAddress: bookingState.setPassengerOriginManualAddress,
    setPassengerDestinationManualAddress: bookingState.setPassengerDestinationManualAddress,
    setShouldAutofillPassengerOrigin: bookingState.setShouldAutofillPassengerOrigin,
    openBookingSuccessModal: wizard.openBookingSuccessModal,
    refreshBookingLists: activity.refreshBookingLists,
    refetchKycStatus: bookingState.refetchKycStatus,
    openPassengerIdentityVerification: access.openPassengerIdentityVerification,
    activeBooking: activity.activeBooking,
    cancelBookingMutation: bookingState.cancelBookingMutation,
    showDialog: data.showDialog,
  });

  const statusConfig = {
    upcoming: { color: Colors.secondary, bgColor: 'rgba(247, 184, 1, 0.1)', label: 'À venir' },
    ongoing: { color: Colors.info, bgColor: 'rgba(52, 152, 219, 0.1)', label: 'En cours' },
    completed: { color: Colors.success, bgColor: 'rgba(46, 204, 113, 0.1)', label: 'Terminé' },
    cancelled: { color: Colors.gray[600], bgColor: Colors.gray[200], label: 'Annulé' },
  };

  const config = data.trip
    ? statusConfig[data.trip.status as keyof typeof statusConfig] ?? statusConfig.upcoming
    : statusConfig.upcoming;

  const route = useTripDetailRouteCoordinates({
    isScreenActive: data.isScreenActive,
    trip: data.trip,
    setRouteCoordinates: bookingState.setRouteCoordinates,
    setRouteInfo: bookingState.setRouteInfo,
    setCalculatedArrivalTime: bookingState.setCalculatedArrivalTime,
    setIsLoadingRoute: bookingState.setIsLoadingRoute,
  });

  // Calculate estimated coordinate based on progress
  const mapPresentation = useTripDetailMapPresentation({
    isScreenActive: data.isScreenActive,
    trip: data.trip,
    progress: access.progress,
    departureCoordinate: route.departureCoordinate,
    arrivalCoordinate: route.arrivalCoordinate,
    liveDriverCoordinate: data.liveDriverCoordinate,
    routeCoordinates: bookingState.routeCoordinates,
    hasValidRouteEndpoints: route.hasValidRouteEndpoints,
    tripBookings: data.tripBookings,
    routeInfo: bookingState.routeInfo,
    setEstimatedArrivalTime: bookingState.setEstimatedArrivalTime,
  });

  const hasRenderableTripMap = data.trip?.status !== 'ongoing' && route.hasValidRouteEndpoints;
  const canRenderTripMap = hasRenderableTripMap && bookingState.isDetailMapReady;
  const presentation = useTripDetailPresentation({
    trip: data.trip,
    calculatedArrivalTime: bookingState.calculatedArrivalTime,
    availableSeats: access.availableSeats,
    routeInfo: bookingState.routeInfo,
    insets: data.insets,
  });

  return {
    data,
    hasRenderableTripMap,
    presentation,
    safety,
    access,
    contact,
    bookingState,
    activity,
    canRenderTripMap,
    mapPresentation,
    route,
    config,
    editing,
    pricing,
    payment,
    bookingSubmission,
    bookingLocation,
    wizard,
  };
}
