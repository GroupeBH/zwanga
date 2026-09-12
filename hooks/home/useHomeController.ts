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

export function useHomeController() {
  const context = useHomeContext();
  const driverActivity = useHomeDriverActivity({ ...context });
  const location = useHomeLocation({ ...context, ...driverActivity });
  const tripFeed = useHomeTripFeed({ ...location, ...context });
  const passengerActivity = useHomePassengerActivity({ ...context });
  const tripSelection = useHomeTripSelection({ ...tripFeed, ...context, ...passengerActivity, ...driverActivity });
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
    ...tracking,
    ...passengerMarkers,
    ...mapNavigation,
    ...map,
    ...userLocation,
    ...sheet,
  };
}
