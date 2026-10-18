import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationData } from './useDriverNavigationData';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';

interface Params {
  data: ReturnType<typeof useDriverNavigationData>;
  mapState: ReturnType<typeof useDriverNavigationMapState>;
  refs: ReturnType<typeof useDriverNavigationRefs>;
}

export function useDriverMapPerspective({
  data,
  mapState,
  refs,
}: Params) {
  const { isTripOngoing } = data;
  const { isNativeMapReady, isLoadingRoute, mapRef, currentLocation, heading, runMapCommand } = mapState;
  const { hasEnabled3DRef, currentLocationRef } = refs;
  useEffect(() => {
    if (!isTripOngoing || !isNativeMapReady) {
      hasEnabled3DRef.current = false;
      return;
    }

    if (hasEnabled3DRef.current || isLoadingRoute || !mapRef.current || !currentLocationRef.current) {
      return;
    }

    const location = currentLocationRef.current;
    const center = normalizeTripMapCoordinate(location.coords.latitude, location.coords.longitude);
    if (!center) return;
    hasEnabled3DRef.current = runMapCommand((map) => {
      const camera = { center, pitch: Platform.OS === 'ios' ? 0 : 60,
        heading: Number.isFinite(heading) ? heading : 0, zoom: 17 };
      // One initial command, after route fitting. A flat iOS view also renders fewer distant tiles.
      if (Platform.OS === 'ios') map.setCamera(camera);
      else map.animateCamera(camera, { duration: 800 });
    });
  }, [isTripOngoing, isNativeMapReady, isLoadingRoute, mapRef, currentLocation,
    heading, runMapCommand, hasEnabled3DRef, currentLocationRef]);

  return {

  };
}
