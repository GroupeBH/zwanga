import { AppUpdatePrompt } from '@/components/AppUpdatePrompt';
import { HomeActivityCards } from '@/components/home/HomeActivityCards';
import { HomeDashboardActions } from '@/components/home/HomeDashboardActions';
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
  // Reads never replace the map. It occupies a bounded area, not the whole screen.
  const dashboard = <>
    <HomeDashboardActions isDriver={home.isDriver} firstName={home.firstName} isOnline={home.isOnline}
      router={home.router} currentUser={home.currentUser} isScreenActive={home.isScreenActive}
      availableDriverRequests={home.availableDriverRequests} availableTripRequestsLoading={home.availableTripRequestsLoading}
      availableTripRequestsError={home.availableTripRequestsError} />
    <HomeActivityCards
      dismissPriority={home.dismissPriority} prioritiesEnabled={home.isScreenActive}
      highlightedDriverRequest={null} highlightedRequestDistance={null}
      featuredDriverReservation={home.featuredDriverReservation}
      featuredDriverReservationStatus={home.featuredDriverReservationStatus}
      router={home.router}
      featuredDriverReservationPassengerName={home.featuredDriverReservationPassengerName}
      featuredDriverReservationSeatsLabel={home.featuredDriverReservationSeatsLabel}
      featuredDriverUpcomingTrip={home.featuredDriverUpcomingTrip}
      featuredDriverUpcomingTripSeatsLabel={home.featuredDriverUpcomingTripSeatsLabel}
      activeTripRequest={home.activeTripRequest} activeRequestStatus={home.activeRequestStatus}
      openTripRequestDetail={home.openTripRequestDetail}
    />
  </>;
  return <SafeAreaView style={styles.container} edges={[]}>
    <View style={[styles.mapStage, { height: Math.min(300, Math.max(170, home.height * 0.32)) }]}>
      <HomeMap shouldRenderHomeMap={home.shouldRenderHomeMap}
        attachHomeMap={home.attachHomeMap} onHomeMapReady={home.onHomeMapReady} onHomeMapLayout={home.onHomeMapLayout}
        mapRegion={home.mapRegion} userCoordinate={home.userCoordinate} />
      <HomeHeader insets={home.insets} router={home.router} avatarUri={home.avatarUri}
        firstName={home.firstName} unreadNotifications={home.unreadNotifications} />
      <HomeLocationButton locationButtonBottom={home.locationButtonBottom}
        handleReturnToUserLocation={home.handleReturnToUserLocation} isCenteringOnUser={home.isCenteringOnUser} />
    </View>
    <HomeTripsSheet header={dashboard}
      suggestionScopeLabel={home.suggestionScopeLabel} sheetBottomOffset={home.sheetBottomOffset}
      isRequestsSheetMode={home.isRequestsSheetMode} setHomeSheetMode={home.setHomeSheetMode}
      openSheetIndex={home.openSheetIndex} isDriver={home.isDriver} isScreenActive={home.isScreenActive}
      availableDriverRequests={home.availableDriverRequests} sheetLoading={home.sheetLoading}
      sheetError={home.sheetError} sheetOffline={home.sheetOffline} refetchSheetContent={home.refetchSheetContent}
      sheetEmpty={home.sheetEmpty} openTripRequestDetail={home.openTripRequestDetail}
      latestTrips={home.latestTrips} bookedTripIds={home.bookedTripIds} openTripDetail={home.openTripDetail}
    />
    <AppUpdatePrompt enabled={home.isScreenActive && !home.ongoingDriverTrip && !home.ongoingBookedTrip && !home.featuredDriverReservation} />
  </SafeAreaView>;
}
