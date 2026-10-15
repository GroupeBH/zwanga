import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import type { useHomeContext } from './useHomeContext';
import type { useHomeLocation } from './useHomeLocation';
import type { useHomeMap } from './useHomeMap';
import type { useHomeMapNavigation } from './useHomeMapNavigation';

type Props = Pick<ReturnType<typeof useHomeContext>, 'isFocused' | 'showDialog'>
  & Pick<ReturnType<typeof useHomeLocation>, 'lastKnownLocation' | 'getCurrentLocation'>
  & Pick<ReturnType<typeof useHomeMap>, 'animateHomeMapToRegion'>
  & Pick<ReturnType<typeof useHomeMapNavigation>, 'openingMapDetailKey'>;

export function useHomeUserLocation({ isFocused, lastKnownLocation, getCurrentLocation,
  showDialog, animateHomeMapToRegion, openingMapDetailKey }: Props) {
  const [isCenteringOnUser, setIsCenteringOnUser] = useState(false);
  const activeRef = useRef(false);
  const generationRef = useRef(0);
  const centeringRef = useRef(false);
  useEffect(() => {
    activeRef.current = isFocused && !openingMapDetailKey;
    centeringRef.current = false;
    setIsCenteringOnUser(false);
    return () => { activeRef.current = false; generationRef.current += 1; };
  }, [isFocused, openingMapDetailKey]);

  const handleReturnToUserLocation = useCallback(async () => {
    if (!activeRef.current || centeringRef.current) return;
    centeringRef.current = true;
    const generation = ++generationRef.current;
    const isCurrent = () => activeRef.current && generation === generationRef.current;
    setIsCenteringOnUser(true);
    try {
      const location = await getCurrentLocation();
      if (!isCurrent()) return;
      const coordinate = normalizeTripMapCoordinate(location?.coords.latitude, location?.coords.longitude)
        ?? normalizeTripMapCoordinate(lastKnownLocation?.coords.latitude, lastKnownLocation?.coords.longitude);
      if (!coordinate) throw new Error('Location unavailable');
      animateHomeMapToRegion({ ...coordinate, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 480);
      // No reverse geocoding: the Home map only needs a position, not an address.
    } catch {
      if (isCurrent()) showDialog({ variant: 'warning', title: 'Localisation indisponible',
        message: 'Activez la localisation pour voir votre position sur la carte.' });
    } finally {
      if (isCurrent()) { centeringRef.current = false; setIsCenteringOnUser(false); }
    }
  }, [getCurrentLocation, lastKnownLocation?.coords.latitude, lastKnownLocation?.coords.longitude,
    animateHomeMapToRegion, showDialog]);
  return { handleReturnToUserLocation, isCenteringOnUser };
}
