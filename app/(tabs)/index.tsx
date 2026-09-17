import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeLocationButton } from '@/components/home/HomeLocationButton';
import { HomeMap } from '@/components/home/HomeMap';
import { HomeTripsSheet } from '@/components/home/HomeTripsSheet';
import { styles } from '@/features/home/HomeScreen.styles';
import { useHomeController } from '@/hooks/home/useHomeController';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
export default function HomeScreen() {
  const home = useHomeController();
  // Trip reads must never replace/remount the native map, including on a slow network.
  return <SafeAreaView style={styles.container} edges={[]}>
    <HomeMap
      shouldRenderHomeMap={home.shouldRenderHomeMap}
      mapRef={home.mapRef}
      mapRegion={home.mapRegion}
      ongoingDriverTrip={home.ongoingDriverTrip}
      userLocationMarker={home.userLocationMarker}
      lastKnownLocation={home.lastKnownLocation}
      tripsWithMapCoordinates={home.tripsWithMapCoordinates}
      liveUserCoordinate={home.liveUserCoordinate}
      selectedTrip={home.selectedTrip}
      tripMarkerRefs={home.tripMarkerRefs}
      openTripDetail={home.openTripDetail}
      setLoadedTripMarkerKeys={home.setLoadedTripMarkerKeys}
      tripRequestsWithMapCoordinates={home.tripRequestsWithMapCoordinates}
      openTripRequestDetail={home.openTripRequestDetail}
      visibleDriverPassengerMarkers={home.visibleDriverPassengerMarkers}
      passengerMarkerRefs={home.passengerMarkerRefs}
      router={home.router}
      loadedTripMarkerKeys={home.loadedTripMarkerKeys}
      userLocationMarkerRef={home.userLocationMarkerRef}
      showUserLocationCallout={home.showUserLocationCallout}
    />
    <View style={styles.mapVeil} pointerEvents="none" />
    <HomeLocationButton
      locationButtonBottom={home.locationButtonBottom}
      handleReturnToUserLocation={home.handleReturnToUserLocation}
      isCenteringOnUser={home.isCenteringOnUser}
    />
    <HomeHeader
      highlightedDriverRequest={home.highlightedDriverRequest}
      highlightedRequestDistance={home.highlightedRequestDistance}
      insets={home.insets}
      router={home.router}
      avatarUri={home.avatarUri}
      firstName={home.firstName}
      ongoingDriverTrip={home.ongoingDriverTrip}
      trackedTripInfo={home.trackedTripInfo}
      ongoingBookedTrip={home.ongoingBookedTrip}
      availableTripsLabel={home.availableTripsLabel}
      latestTrips={home.latestTrips}
      unreadNotifications={home.unreadNotifications}
      featuredDriverReservation={home.featuredDriverReservation}
      featuredDriverReservationStatus={home.featuredDriverReservationStatus}
      featuredDriverReservationPassengerName={home.featuredDriverReservationPassengerName}
      featuredDriverReservationSeatsLabel={home.featuredDriverReservationSeatsLabel}
      featuredDriverUpcomingTrip={home.featuredDriverUpcomingTrip}
      featuredDriverUpcomingTripSeatsLabel={home.featuredDriverUpcomingTripSeatsLabel}
      activeTripRequest={home.activeTripRequest}
      activeRequestStatus={home.activeRequestStatus}
      openTripRequestDetail={home.openTripRequestDetail}
    />
    <HomeTripsSheet
      sheetBottomOffset={home.sheetBottomOffset}
      sheetHeight={home.sheetHeight}
      effectiveTripsSheetOpen={home.effectiveTripsSheetOpen}
      toggleTripsSheet={home.toggleTripsSheet}
      isHomeSheetLockedRetracted={home.isHomeSheetLockedRetracted}
      sheetTitle={home.sheetTitle}
      sheetSubtitle={home.sheetSubtitle}
      openSheetIndex={home.openSheetIndex}
      isDriver={home.isDriver}
      isRequestsSheetMode={home.isRequestsSheetMode}
      setHomeSheetMode={home.setHomeSheetMode}
      availableDriverRequests={home.availableDriverRequests}
      sheetLoading={home.sheetLoading}
      sheetError={home.sheetError}
      refetchSheetContent={home.refetchSheetContent}
      sheetEmpty={home.sheetEmpty}
      tripCardWidth={home.tripCardWidth}
      openTripRequestDetail={home.openTripRequestDetail}
      latestTrips={home.latestTrips}
      bookedTripIds={home.bookedTripIds}
      selectedTrip={home.selectedTrip}
      openTripDetail={home.openTripDetail}
    />
  </SafeAreaView>;
}
