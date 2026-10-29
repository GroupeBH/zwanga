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
import { buildHomeEntryAnnouncement } from '@/features/notifications/homeEntryAnnouncement';
import { useRideEntryAnnouncement } from '@/hooks/notifications/useRideEntryAnnouncement';

export function useHomeController(context: ReturnType<typeof useHomeContext>) {
  const priorities = useHomePriorityDismissals(context.currentUser?.id);
  // Queries, sockets and camera commands pause outside the foreground. Map ownership
  // and the GPS lifecycle follow route focus; useUserLocation handles AppState itself.
  const foregroundContext = { ...context, isFocused: context.isScreenActive };
  const driverActivity = useHomeDriverActivity({ ...foregroundContext, ...priorities });
  const location = useHomeLocation({ ...context, ...driverActivity });
  const passengerActivity = useHomePassengerActivity({ ...foregroundContext, ...priorities, driverCoordinate: location.liveUserCoordinate });
  const tripFeed = useHomeTripFeed({ ...location, ...foregroundContext, ...passengerActivity });
  const tripSelection = useHomeTripSelection({ ...tripFeed, ...context, ...passengerActivity, ...driverActivity, ...priorities, liveUserCoordinate: location.liveUserCoordinate });
  const requestHighlight = useHomeRequestHighlight({
    enabled: context.isScreenActive && context.isDriver && !tripSelection.isHomeSheetLockedRetracted
      && !tripFeed.showInitialHomeLoader && !tripSelection.featuredDriverReservation,
    userId: context.currentUser?.id,
    requests: passengerActivity.availableDriverRequests,
    hiddenHomePriorities: priorities.hiddenHomePriorities,
    driverCoordinate: location.liveUserCoordinate,
  });
  useHomeTracking({ ...foregroundContext, ...passengerActivity, ...driverActivity, ...tripSelection, ...location });
  const mapNavigation = useHomeMapNavigation({ ...context });
  const mapMarkers = useHomeMapMarkers({ ...passengerActivity, ...tripSelection, ...priorities, ...mapNavigation,
    isDriver: context.isDriver, enabled: !tripSelection.activeHomeTrip });
  const map = useHomeMap({ ...foregroundContext, ...tripSelection, ...driverActivity, ...location, ...passengerActivity, ...mapNavigation });
  const userLocation = useHomeUserLocation({ ...foregroundContext, ...location, ...driverActivity, ...map, ...mapNavigation });
  const hasMapPriorities = !tripSelection.isHomeSheetLockedRetracted && Boolean(
    (tripSelection.featuredDriverReservation && tripSelection.featuredDriverReservationStatus)
    || tripSelection.featuredDriverUpcomingTrip || tripSelection.featuredPassengerTrip
    || requestHighlight.highlightedDriverRequest
    || (passengerActivity.activeTripRequest && passengerActivity.activeRequestStatus),
  );
  const sheet = useHomeSheet({ ...context, ...tripSelection, ...passengerActivity, ...driverActivity, ...tripFeed, hasMapPriorities });
  useRideEntryAnnouncement(context.currentUser?.id, context.isScreenActive,
    context.isHomeRoleReady && driverActivity.driverAnnouncementReady && passengerActivity.passengerAnnouncementReady && !tripSelection.activeHomeTrip &&
      (Boolean(tripSelection.featuredDriverReservation || tripSelection.featuredDriverUpcomingTrip || tripSelection.featuredPassengerTrip) || passengerActivity.driverRequestsAnnouncementReady),
    context.currentUser && hasMapPriorities ? buildHomeEntryAnnouncement({
      userId: context.currentUser.id, isDriver: context.isDriver, ...tripSelection, ...passengerActivity, ...requestHighlight,
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
    hasMapPriorities,
  };
}
