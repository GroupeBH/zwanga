import type { useHomeContext } from './useHomeContext';
import { useHomeDriverActivity } from './useHomeDriverActivity';
import { useHomeLocation } from './useHomeLocation';
import { useHomeMap } from './useHomeMap';
import { useHomeMapNavigation } from './useHomeMapNavigation';
import { useHomePassengerActivity } from './useHomePassengerActivity';
import { useHomeSheet } from './useHomeSheet';
import { useHomeTracking } from './useHomeTracking';
import { useHomeTripFeed } from './useHomeTripFeed';
import { useHomeTripSelection } from './useHomeTripSelection';
import { useHomeUserLocation } from './useHomeUserLocation';
import { useHomeRequestHighlight } from './useHomeRequestHighlight';
import { useHomePriorityDismissals } from './useHomePriorityDismissals';
import { useHomeMapMarkers } from './useHomeMapMarkers';
import { useHomeSupportingData } from './useHomeSupportingData';
import { useHomeRequestPickup } from './useHomeRequestPickup';
import { useHomeAcceptedDriverCourse } from './useHomeAcceptedDriverCourse';
import { buildHomeEntryAnnouncement } from '@/features/notifications/homeEntryAnnouncement';
import { useRideEntryAnnouncement } from '@/hooks/notifications/useRideEntryAnnouncement';

export function useHomeController(context: ReturnType<typeof useHomeContext>) {
  const priorities = useHomePriorityDismissals(context.currentUser?.id);
  // Queries, sockets and camera commands pause outside the foreground. Map ownership
  // and the GPS lifecycle follow route focus; useUserLocation handles AppState itself.
  const foregroundContext = { ...context, isFocused: context.isScreenActive };
  const preparationContext = { ...context, isFocused: context.isDataActive };
  const supportingDataPrepared = useHomeSupportingData({ active: context.isDataActive, isDriver: context.isDriver });
  const driverActivity = useHomeDriverActivity({ ...preparationContext, ...priorities });
  const location = useHomeLocation({ ...context, ...driverActivity,
    isFocused: context.isFocused && (!context.entryPending || context.preparationAllowed) });
  const passengerActivity = useHomePassengerActivity({ ...preparationContext, ...priorities, driverCoordinate: location.liveUserCoordinate });
  const tripFeed = useHomeTripFeed({ ...location, ...preparationContext, ...passengerActivity });
  const tripSelection = useHomeTripSelection({ ...tripFeed, ...context, ...passengerActivity, ...driverActivity, ...priorities, liveUserCoordinate: location.liveUserCoordinate });
  const pickup = useHomeRequestPickup({ requests: passengerActivity.myTripRequests,
    bookings: passengerActivity.myBookings, userId: context.currentUser?.id,
    refreshedTrip: passengerActivity.refreshedPassengerTrip, occupiedTrip: tripSelection.activeHomeTrip,
    active: context.isScreenActive });
  const acceptedCourse = useHomeAcceptedDriverCourse({ trips: driverActivity.myDriverTrips,
    userId: context.currentUser?.id, isDriver: context.isDriver,
    occupied: Boolean(tripSelection.activeHomeTrip || pickup.homeRequestPickup), active: context.isDataActive });
  const hasPickup = Boolean(pickup.homeRequestPickup || acceptedCourse.acceptedDriverCourse);
  const requestHighlight = useHomeRequestHighlight({
    enabled: context.isScreenActive && context.isDriver && !hasPickup && !tripSelection.isHomeSheetLockedRetracted
      && !tripFeed.showInitialHomeLoader && !tripSelection.featuredDriverReservation,
    userId: context.currentUser?.id,
    requests: passengerActivity.availableDriverRequests,
    hiddenHomePriorities: priorities.hiddenHomePriorities,
    driverCoordinate: location.liveUserCoordinate,
  });
  useHomeTracking({ ...foregroundContext, ...passengerActivity, ...driverActivity, ...tripSelection, ...location });
  const mapNavigation = useHomeMapNavigation({ ...context });
  const mapMarkers = useHomeMapMarkers({ ...passengerActivity, ...tripSelection, ...priorities, ...mapNavigation,
    isDriver: context.isDriver, enabled: !tripSelection.activeHomeTrip && !hasPickup });
  const map = useHomeMap({ ...foregroundContext, ...tripSelection, ...driverActivity, ...location, ...passengerActivity, ...mapNavigation,
    priorityRegion: pickup.pickupRegion ?? acceptedCourse.acceptedCourseRegion, priorityKey: pickup.homeRequestPickup
      ? `${pickup.homeRequestPickup.id}:${pickup.homeRequestPickup.selectedDriverId}`
      : acceptedCourse.acceptedDriverCourse ? `driver-course:${acceptedCourse.acceptedDriverCourse.trip.id}` : undefined });
  const userLocation = useHomeUserLocation({ ...foregroundContext, ...location, ...driverActivity, ...map, ...mapNavigation });
  const hasMapPriorities = !hasPickup && !tripSelection.isHomeSheetLockedRetracted && Boolean(
    (tripSelection.featuredDriverReservation && tripSelection.featuredDriverReservationStatus)
    || tripSelection.featuredDriverUpcomingTrip || tripSelection.featuredPassengerTrip
    || (passengerActivity.activeTripRequest && passengerActivity.activeRequestStatus),
  );
  const sheet = useHomeSheet({ ...context, ...tripSelection, ...passengerActivity, ...driverActivity, ...tripFeed, hasMapPriorities,
    hasRequestPickup: hasPickup });
  useRideEntryAnnouncement(context.currentUser?.id, context.isScreenActive,
    context.isHomeRoleReady && driverActivity.driverAnnouncementReady && passengerActivity.passengerAnnouncementReady && !tripSelection.activeHomeTrip && !hasPickup &&
      (Boolean(tripSelection.featuredDriverReservation) || passengerActivity.driverRequestsAnnouncementReady),
    context.currentUser && (tripSelection.featuredDriverReservation || requestHighlight.highlightedDriverRequest) ? buildHomeEntryAnnouncement({
      userId: context.currentUser.id, isDriver: context.isDriver, activeBookings: [],
      featuredDriverReservation: tripSelection.featuredDriverReservation,
      highlightedDriverRequest: requestHighlight.highlightedDriverRequest,
    }) : null);
  return {
    ...context,
    ...priorities,
    ...driverActivity,
    ...location,
    ...tripFeed,
    ...passengerActivity,
    ...tripSelection,
    ...requestHighlight,
    ...mapNavigation,
    ...mapMarkers,
    ...map,
    ...userLocation,
    ...sheet,
    ...pickup,
    ...acceptedCourse,
    hasMapPriorities,
    // A confirmed pickup must not wait behind unrelated discovery/favorites reads.
    homeDataPrepared: driverActivity.driverDataPrepared && passengerActivity.passengerDataPrepared &&
      (hasPickup || (supportingDataPrepared &&
        (context.isDriver ? !passengerActivity.availableTripRequestsLoading : !tripFeed.tripsLoading))),
  };
}
