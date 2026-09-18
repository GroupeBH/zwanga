import { useHomeContext } from './useHomeContext';
import { useHomeDriverActivity } from './useHomeDriverActivity';
import { useHomeLocation } from './useHomeLocation';
import { useHomeMap } from './useHomeMap';
import { useHomeMapNavigation } from './useHomeMapNavigation';
import { useHomePassengerActivity } from './useHomePassengerActivity';
import { useHomePassengerMarkers } from './useHomePassengerMarkers';
import { useHomeSheet } from './useHomeSheet';
import { useHomeTracking } from './useHomeTracking';
import { useHomeTripFeed } from './useHomeTripFeed';
import { useHomeTripSelection } from './useHomeTripSelection';
import { useHomeUserLocation } from './useHomeUserLocation';
import { useHomeRequestHighlight } from './useHomeRequestHighlight';
import { useHomePriorityDismissals } from './useHomePriorityDismissals';

export function useHomeController() {
  const context = useHomeContext();
  const priorities = useHomePriorityDismissals(context.currentUser?.id);
  // Queries, sockets and camera commands pause outside the foreground. Map ownership
  // and the GPS lifecycle follow route focus; useUserLocation handles AppState itself.
  const foregroundContext = { ...context, isFocused: context.isScreenActive };
  const driverActivity = useHomeDriverActivity({ ...foregroundContext, ...priorities });
  const location = useHomeLocation({ ...context, ...driverActivity });
  const tripFeed = useHomeTripFeed({ ...location, ...foregroundContext });
  const passengerActivity = useHomePassengerActivity({ ...foregroundContext, ...priorities, driverCoordinate: location.liveUserCoordinate });
  const tripSelection = useHomeTripSelection({ ...tripFeed, ...context, ...passengerActivity, ...driverActivity, ...priorities, liveUserCoordinate: location.liveUserCoordinate });
  const requestHighlight = useHomeRequestHighlight({
    enabled: context.isScreenActive && context.isDriver && !tripSelection.isHomeSheetLockedRetracted
      && !tripFeed.showInitialHomeLoader && !tripSelection.featuredDriverReservation,
    userId: context.currentUser?.id,
    requests: passengerActivity.availableDriverRequests,
    hiddenHomePriorities: priorities.hiddenHomePriorities,
    driverCoordinate: location.liveUserCoordinate,
  });
  const tracking = useHomeTracking({ ...foregroundContext, ...passengerActivity, ...driverActivity, ...tripSelection, ...location });
  const passengerMarkers = useHomePassengerMarkers({ ...driverActivity, ...tracking });
  const mapNavigation = useHomeMapNavigation({ ...context });
  const map = useHomeMap({ ...foregroundContext, ...tripSelection, ...driverActivity, ...location, ...passengerActivity, ...passengerMarkers, ...mapNavigation });
  const userLocation = useHomeUserLocation({ ...foregroundContext, ...location, ...driverActivity, ...map, ...mapNavigation });
  const sheet = useHomeSheet({ ...context, ...tripSelection, ...passengerActivity, ...driverActivity, ...passengerMarkers, ...tripFeed });
  return {
    ...context,
    ...priorities,
    ...driverActivity,
    ...location,
    ...tripFeed,
    ...passengerActivity,
    ...tripSelection,
    ...requestHighlight,
    ...tracking,
    ...passengerMarkers,
    ...mapNavigation,
    ...map,
    ...userLocation,
    ...sheet,
  };
}
