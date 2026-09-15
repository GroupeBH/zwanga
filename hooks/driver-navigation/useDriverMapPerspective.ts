import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationData } from './useDriverNavigationData';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import { useEffect } from 'react';

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
  useEffect(() => {
    if (!data.isTripOngoing || !mapState.isNativeMapReady) {
      refs.hasEnabled3DRef.current = false;
      return;
    }

    if (refs.hasEnabled3DRef.current || !mapState.mapRef.current || !refs.currentLocationRef.current) {
      return;
    }

    const location = refs.currentLocationRef.current;
    refs.hasEnabled3DRef.current = mapState.runMapCommand((map) => map.animateCamera(
      {
        center: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
        pitch: 60,
        heading: mapState.heading,
        zoom: 17,
      },
      { duration: 800 }
    ));
  }, [data.isTripOngoing, mapState.isNativeMapReady, mapState.currentLocation, mapState.heading, mapState.runMapCommand]);

  return {

  };
}
