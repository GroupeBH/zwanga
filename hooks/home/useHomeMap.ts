import { HOME_USER_LOCATION_DELTA, KINSHASA_REGION } from '@/features/home/homeMapPolicy';
import { useHomeMapCamera } from './useHomeMapCamera';
import { useMemo, useRef, useState } from 'react';
import MapView, { type Region } from 'react-native-maps';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeLocation } from '@/hooks/home/useHomeLocation';
import type { useHomeMapNavigation } from '@/hooks/home/useHomeMapNavigation';

type Props =
  Pick<ReturnType<typeof useHomeContext>, 'isFocused'>
  & Pick<ReturnType<typeof useHomeLocation>, 'liveUserCoordinate'>
  & Pick<ReturnType<typeof useHomeMapNavigation>, 'openingMapDetailKey'>;

export function useHomeMap({
  isFocused,
  liveUserCoordinate,
  openingMapDetailKey,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const [mapFocusedOnUser, setMapFocusedOnUser] = useState(false);

  const mapRegion = useMemo<Region>(() => {
    const ownCoordinate = liveUserCoordinate;
    if (!ownCoordinate) return KINSHASA_REGION;

    return {
      ...ownCoordinate,
      latitudeDelta: HOME_USER_LOCATION_DELTA,
      longitudeDelta: HOME_USER_LOCATION_DELTA,
    };
  }, [liveUserCoordinate]);

  const cameraRegion = mapFocusedOnUser && liveUserCoordinate
    ? { ...liveUserCoordinate, latitudeDelta: HOME_USER_LOCATION_DELTA, longitudeDelta: HOME_USER_LOCATION_DELTA }
    : mapRegion;
  useHomeMapCamera(mapRef, isFocused && !openingMapDetailKey, cameraRegion);

  return {
    setMapFocusedOnUser,
    mapRef,
    mapRegion,
  };
}
