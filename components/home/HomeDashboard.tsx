import type { useHomeContext } from '@/hooks/home/useHomeContext';
import { useCallback, useEffect, useState } from 'react';
import { useReportHomePrepared } from '@/features/navigation/homePreparationContext';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeLocationButton } from '@/components/home/HomeLocationButton';
import { HomeMap } from '@/components/home/HomeMap';
import { HomeTripsSheet } from '@/components/home/HomeTripsSheet';
import { HomeOngoingTripSheet } from '@/components/home/HomeOngoingTripSheet';
import { HomeRequestPickupSheet } from '@/components/home/HomeRequestPickupSheet';
import { HomeAcceptedDriverCourseSheet } from '@/components/home/HomeAcceptedDriverCourseSheet';
import { HomeActivityCards } from '@/components/home/HomeActivityCards';
import { HomeRequestModal } from '@/components/home/HomeRequestModal';
import { AppUpdatePrompt } from '@/components/AppUpdatePrompt';
import { styles } from '@/features/home/HomeScreen.styles';
import { useHomeController } from '@/hooks/home/useHomeController';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMainScreenReady } from '@/hooks/useMainScreenReady';
import { useWindowDimensions } from 'react-native';
import { useAppSelector } from '@/store/hooks';
import { selectUnreadMessagesCount } from '@/store/selectors';
export function HomeDashboard({ context }: { context: ReturnType<typeof useHomeContext> }) {
  const home = useHomeController(context);
  const unreadMessages = useAppSelector(selectUnreadMessagesCount);
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const reportPrepared = useReportHomePrepared();
  const [laidOut, setLaidOut] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const reportMapReady = useCallback(() => setMapReady(true), []);
  const prepared = home.homeDataPrepared && (mapReady || !home.shouldRenderHomeMap);
  const reportLayout = useMainScreenReady(home.isScreenActive && context.isHomeRoleReady && prepared, 'home');
  useEffect(() => {
    if (laidOut && prepared && context.isDataActive) reportPrepared?.();
  }, [laidOut, prepared, context.isDataActive, reportPrepared]);
  // Trip reads must never replace/remount the native map, including on a slow network.
  return <SafeAreaView style={styles.container} edges={[]} onLayout={event => {
    home.onHomeLayout(event); setLaidOut(true); reportLayout();
  }}>
    <HomeMap
      shouldRenderHomeMap={home.shouldRenderHomeMap}
      mapRef={home.mapRef}
      mapRegion={home.mapRegion}
      userLocationMarker={home.userLocationMarker}
      liveUserCoordinate={home.liveUserCoordinate}
      mapBottomOffset={home.mapBottomOffset}
      homeMapPadding={home.homeMapPadding}
      showLocationLegend={home.showLocationLegend}
      userLocationMarkerRef={home.userLocationMarkerRef}
      showUserLocationCallout={home.showUserLocationCallout}
      markers={home.homeMapMarkers}
      markerSummary={home.homeMapMarkerSummary}
      pickupModel={home.pickupModel}
      acceptedDriverCourse={home.acceptedDriverCourse}
      onMarkerPress={home.openHomeMapMarker}
      onReady={reportMapReady}
    />
    <HomeLocationButton
      key={`location:${home.currentUser?.id}`}
      active={home.isScreenActive}
      locationButtonBottom={home.locationButtonBottom}
      handleReturnToUserLocation={home.handleReturnToUserLocation}
      isCenteringOnUser={home.isCenteringOnUser}
    />
    <HomeHeader
      insets={home.insets}
      router={home.router}
      profileInitial={home.profileInitial}
      ongoingDriverTrip={home.ongoingDriverTrip}
      ongoingBookedTrip={home.ongoingBookedTrip}
      unreadNotifications={home.unreadNotifications}
      unreadMessages={unreadMessages}
      ongoingBookingId={home.ongoingBookingId}
      showOngoingShortcut={!home.activeHomeTrip && !home.homeRequestPickup && !home.acceptedDriverCourse}
      hasRequestPickup={Boolean(home.homeRequestPickup || home.acceptedDriverCourse)}
      isDriver={home.isDriver}
      isScreenActive={home.isScreenActive}
      discoveryLabel={home.sheetOffline || home.sheetError || home.sheetLoading || !home.latestTrips ? 'Explorer les départs' : `${home.latestTrips.length} départ${home.latestTrips.length > 1 ? 's' : ''} à découvrir`}
      onDiscover={home.openSheetIndex}
    />
    {home.shouldRenderHomeMap && home.hasMapPriorities && !largeText && <HomeActivityCards
        key={`activity:${home.currentUser?.id}`}
        mapLayout={home.mapPriorityLayout}
        dismissPriority={home.dismissPriority}
        prioritiesEnabled={home.isScreenActive}
        featuredDriverReservation={home.featuredDriverReservation}
        featuredDriverReservationStatus={home.featuredDriverReservationStatus}
        router={home.router}
        featuredDriverReservationPassengerName={home.featuredDriverReservationPassengerName}
        featuredDriverReservationSeatsLabel={home.featuredDriverReservationSeatsLabel}
        featuredDriverUpcomingTrip={home.featuredDriverUpcomingTrip}
        featuredDriverUpcomingTripSeatsLabel={home.featuredDriverUpcomingTripSeatsLabel}
        activeTripRequest={home.activeTripRequest}
        activeRequestStatus={home.activeRequestStatus}
        openTripRequestDetail={home.openTripRequestDetail}
        featuredPassengerTrip={home.featuredPassengerTrip}
        openTripDetail={home.openTripDetail}
      />}
    {home.homeRequestPickup ? <HomeRequestPickupSheet {...home} /> : home.activeHomeTrip ? <HomeOngoingTripSheet
      isScreenActive={home.isScreenActive}
      activeHomeTrip={home.activeHomeTrip}
      ongoingDriverTrip={home.ongoingDriverTrip}
      ongoingBookingId={home.ongoingBookingId}
      activeBookings={home.activeBookings}
      router={home.router}
      width={home.width}
      sheetBottomOffset={home.sheetBottomOffset}
      sheetHeight={home.sheetHeight}
      onSheetLayout={home.onSheetLayout}
    /> : home.acceptedDriverCourse ? <HomeAcceptedDriverCourseSheet {...home} acceptedDriverCourse={home.acceptedDriverCourse} /> : <HomeTripsSheet
      priorityContent={largeText && home.hasMapPriorities ? <HomeActivityCards
        key={`activity:${home.currentUser?.id}`} dismissPriority={home.dismissPriority} prioritiesEnabled={home.isScreenActive}
        featuredDriverReservation={home.featuredDriverReservation} featuredDriverReservationStatus={home.featuredDriverReservationStatus}
        router={home.router} featuredDriverReservationPassengerName={home.featuredDriverReservationPassengerName}
        featuredDriverReservationSeatsLabel={home.featuredDriverReservationSeatsLabel}
        featuredDriverUpcomingTrip={home.featuredDriverUpcomingTrip} featuredDriverUpcomingTripSeatsLabel={home.featuredDriverUpcomingTripSeatsLabel}
        activeTripRequest={home.activeTripRequest} activeRequestStatus={home.activeRequestStatus} openTripRequestDetail={home.openTripRequestDetail}
        featuredPassengerTrip={home.featuredPassengerTrip} openTripDetail={home.openTripDetail} /> : undefined}
      recentDestinations={home.recentDestinations}
      hiddenHomePriorities={home.hiddenHomePriorities}
      featuredPassengerTrip={home.featuredPassengerTrip}
      router={home.router}
      suggestionScopeLabel={home.suggestionScopeLabel}
      sheetBottomOffset={home.sheetBottomOffset}
      sheetHeight={home.sheetHeight}
      onSheetLayout={home.onSheetLayout}
      effectiveTripsSheetOpen={home.effectiveTripsSheetOpen}
      toggleTripsSheet={home.toggleTripsSheet}
      isHomeSheetLockedRetracted={home.isHomeSheetLockedRetracted}
      sheetTitle={home.sheetTitle}
      openSheetIndex={home.openSheetIndex}
      isDriver={home.isDriver}
      driverCategory={home.currentUser?.driverCategory}
      isScreenActive={home.isScreenActive}
      prioritiesEnabled={home.isScreenActive}
      dismissPriority={home.dismissPriority}
      availableDriverRequests={home.availableDriverRequests}
      sheetLoading={home.sheetLoading}
      sheetOffline={home.sheetOffline}
      sheetError={home.sheetError}
      refetchSheetContent={home.refetchSheetContent}
      sheetEmpty={home.sheetEmpty}
      openTripRequestDetail={home.openTripRequestDetail}
      latestTrips={home.latestTrips}
      bookedTripIds={home.bookedTripIds}
      openTripDetail={home.openTripDetail}
    />}
    <HomeRequestModal key={`request:${home.currentUser?.id}`} userId={home.currentUser?.id}
      request={home.highlightedDriverRequest} router={home.router} dismissPriority={home.dismissPriority}
      onOpenRequestDetail={home.openTripRequestDetail}
      enabled={home.isScreenActive && home.isDriver && !home.activeHomeTrip && !home.homeRequestPickup && !home.acceptedDriverCourse && !home.availableTripRequestsError} />
    <AppUpdatePrompt enabled={Boolean(context.isHomeRoleReady && home.isScreenActive && home.homeDataPrepared
      && home.passengerAnnouncementReady && home.driverAnnouncementReady && home.driverRequestsAnnouncementReady
      && !home.activeHomeTrip && !home.homeRequestPickup && !home.acceptedDriverCourse && !home.activeTripRequest
      && !home.ongoingDriverTrip && !home.ongoingPassengerBooking && !home.activePassengerBooking
      && !home.featuredDriverReservation && !home.highlightedDriverRequest)} />
  </SafeAreaView>;
}
