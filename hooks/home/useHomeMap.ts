import { KINSHASA_REGION } from '@/features/home/homeMapPolicy';
import type { MapCoordinate } from '@/features/home/homeTypes';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { useMemo, useRef } from 'react';
import MapView, { type Region } from 'react-native-maps';
import { useHomeMapCamera } from './useHomeMapCamera';

type Props = { isFocused: boolean; liveUserCoordinate: MapCoordinate | null; openingMapDetailKey: string | null };
export function useHomeMap({ isFocused, liveUserCoordinate, openingMapDetailKey }: Props) {
  const mapRef = useRef<MapView>(null);
  const userCoordinate = useMemo(() => normalizeTripMapCoordinate(liveUserCoordinate?.latitude,
    liveUserCoordinate?.longitude), [liveUserCoordinate?.latitude, liveUserCoordinate?.longitude]);
  // Discovery data and role changes cannot move this camera or add markers.
  const mapRegion = useMemo<Region>(() => userCoordinate
    ? { ...userCoordinate, latitudeDelta: 0.025, longitudeDelta: 0.025 }
    : KINSHASA_REGION, [userCoordinate]);
  const camera = useHomeMapCamera(mapRef, isFocused && !openingMapDetailKey, mapRegion);
  return { ...camera, mapRegion, userCoordinate };
}
