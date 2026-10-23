import type { useHomeContext } from '@/hooks/home/useHomeContext';
import { AppUpdatePrompt } from '@/components/AppUpdatePrompt';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeLocationButton } from '@/components/home/HomeLocationButton';
import { HomeMap } from '@/components/home/HomeMap';
import { HomeTripsSheet } from '@/components/home/HomeTripsSheet';
import { HomeActivityCards } from '@/components/home/HomeActivityCards';
import { styles } from '@/features/home/HomeScreen.styles';
import { useHomeController } from '@/hooks/home/useHomeController';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMainScreenReady } from '@/hooks/useMainScreenReady';
export function HomeDashboard({ context }: { context: ReturnType<typeof useHomeContext> }) {
  const home = useHomeController(context);
  const reportLayout = useMainScreenReady(home.isScreenActive && context.isHomeRoleReady, 'home');
  // Trip reads must never replace/remount the native map, including on a slow network.
  return <SafeAreaView style={styles.container} edges={[]} onLayout={event => { home.onHomeLayout(event); reportLayout(); }}>
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
    />
    <HomeLocationButton
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
    />
    {home.shouldRenderHomeMap && home.hasMapPriorities && <HomeActivityCards
        key={home.currentUser?.id}
        mapLayout={home.mapPriorityLayout}
        dismissPriority={home.dismissPriority}
        prioritiesEnabled={home.isScreenActive}
        highlightedDriverRequest={home.highlightedDriverRequest}
        highlightedRequestDistance={home.highlightedRequestDistance}
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
    <HomeTripsSheet
      recentDestinations={home.recentDestinations}
      hiddenHomePriorities={home.hiddenHomePriorities}
      featuredPassengerTrip={home.featuredPassengerTrip}
      firstName={home.firstName}
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
      isScreenActive={home.isScreenActive}
      highlightedDriverRequest={home.highlightedDriverRequest}
      prioritiesEnabled={home.isScreenActive}
      dismissPriority={home.dismissPriority}
      availableDriverRequests={home.availableDriverRequests}
      sheetLoading={home.sheetLoading}
      sheetError={home.sheetError}
      refetchSheetContent={home.refetchSheetContent}
      sheetEmpty={home.sheetEmpty}
      openTripRequestDetail={home.openTripRequestDetail}
      latestTrips={home.latestTrips}
      bookedTripIds={home.bookedTripIds}
      openTripDetail={home.openTripDetail}
    />
    <AppUpdatePrompt enabled={home.isScreenActive && !home.ongoingDriverTrip && !home.ongoingBookedTrip && !home.highlightedDriverRequest && !home.featuredDriverReservation} />
  </SafeAreaView>;
}
