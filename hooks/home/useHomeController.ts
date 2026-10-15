import { useHomeContext } from './useHomeContext';
import { useHomeDiscoveryMode } from './useHomeDiscoveryMode';
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
import { useHomePriorityDismissals } from './useHomePriorityDismissals';
import { useEffect } from 'react';
import { recordStartupMilestone } from '@/services/startupDiagnostics';

export function useHomeController() {
  useEffect(() => { recordStartupMilestone('home_mounted'); }, []);
  const context = useHomeContext();
  const discovery = useHomeDiscoveryMode(context);
  const priorities = useHomePriorityDismissals(context.currentUser?.id);
  // Queries, sockets and camera commands pause outside the foreground. Map ownership
  // and the GPS lifecycle follow route focus; useUserLocation handles AppState itself.
  const foregroundContext = { ...context, isFocused: context.isScreenActive };
  const driverActivity = useHomeDriverActivity({ ...foregroundContext, ...priorities });
  const location = useHomeLocation({ ...context, ...driverActivity });
  const passengerActivity = useHomePassengerActivity({ ...foregroundContext, ...priorities, driverCoordinate: location.liveUserCoordinate });
  const tripFeed = useHomeTripFeed({ ...location, ...foregroundContext, ...passengerActivity, ...discovery });
  const tripSelection = useHomeTripSelection({ ...tripFeed, ...context, ...passengerActivity, ...driverActivity, ...priorities, ...discovery, liveUserCoordinate: location.liveUserCoordinate });
  useHomeTracking({ ...foregroundContext, ...passengerActivity, ...driverActivity, ...tripSelection, ...location });
  const mapNavigation = useHomeMapNavigation({ ...context });
  const map = useHomeMap({ isFocused: context.isScreenActive, liveUserCoordinate: location.liveUserCoordinate,
    openingMapDetailKey: mapNavigation.openingMapDetailKey });
  const userLocation = useHomeUserLocation({ ...foregroundContext, ...location, ...driverActivity, ...map, ...mapNavigation });
  const sheet = useHomeSheet({ ...context, ...tripSelection, ...passengerActivity, ...driverActivity, ...tripFeed, ...discovery });
  return {
    ...context,
    ...discovery,
    ...priorities,
    ...driverActivity,
    ...location,
    ...tripFeed,
    ...passengerActivity,
    ...tripSelection,
    ...mapNavigation,
    ...map,
    ...userLocation,
    ...sheet,
  };
}
