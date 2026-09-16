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

export function useHomeController() {
  const context = useHomeContext();
  const driverActivity = useHomeDriverActivity({ ...context });
  const location = useHomeLocation({ ...context, ...driverActivity });
  const tripFeed = useHomeTripFeed({ ...location, ...context });
  const passengerActivity = useHomePassengerActivity({ ...context, driverCoordinate: location.liveUserCoordinate });
  const tripSelection = useHomeTripSelection({ ...tripFeed, ...context, ...passengerActivity, ...driverActivity, liveUserCoordinate: location.liveUserCoordinate });
  const requestHighlight = useHomeRequestHighlight({
    enabled: context.isFocused && context.isDriver && !tripSelection.isHomeSheetLockedRetracted
      && !tripFeed.showInitialHomeLoader && !tripSelection.featuredDriverReservation,
    userId: context.currentUser?.id,
    requests: passengerActivity.availableDriverRequests,
    driverCoordinate: location.liveUserCoordinate,
  });
  const tracking = useHomeTracking({ ...context, ...passengerActivity, ...driverActivity, ...tripSelection, ...location });
  const passengerMarkers = useHomePassengerMarkers({ ...driverActivity, ...tracking });
  const mapNavigation = useHomeMapNavigation({ ...context });
  const map = useHomeMap({ ...context, ...tripSelection, ...driverActivity, ...location, ...passengerActivity, ...passengerMarkers, ...mapNavigation });
  const userLocation = useHomeUserLocation({ ...context, ...location, ...driverActivity, ...map, ...mapNavigation });
  const sheet = useHomeSheet({ ...context, ...tripSelection, ...passengerActivity, ...driverActivity, ...passengerMarkers, ...tripFeed });
  return {
    ...context,
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
