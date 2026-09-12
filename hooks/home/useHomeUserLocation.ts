import type { UserLocationMarkerState } from '@/features/home/homeTypes';
import { buildCurrentLocationSelection } from '@/utils/currentLocationSelection';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type MapMarker } from 'react-native-maps';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeDriverActivity } from '@/hooks/home/useHomeDriverActivity';
import type { useHomeLocation } from '@/hooks/home/useHomeLocation';
import type { useHomeMap } from '@/hooks/home/useHomeMap';
import type { useHomeMapNavigation } from '@/hooks/home/useHomeMapNavigation';
type Props =
  Pick<ReturnType<typeof useHomeContext>,
    'isFocused'
    | 'showDialog'
  >
  & Pick<ReturnType<typeof useHomeLocation>,
    'liveUserCoordinate'
    | 'lastKnownLocation'
    | 'getCurrentLocation'
  >
  & Pick<ReturnType<typeof useHomeDriverActivity>,
    'ongoingDriverTrip'
  >
  & Pick<ReturnType<typeof useHomeMap>,
    'setMapFocusedOnUser'
    | 'mapRef'
  >
  & Pick<ReturnType<typeof useHomeMapNavigation>,
    'openingMapDetailKey'
  >;
export function useHomeUserLocation({
  isFocused,
  liveUserCoordinate,
  ongoingDriverTrip,
  lastKnownLocation,
  getCurrentLocation,
  showDialog,
  setMapFocusedOnUser,
  mapRef,
  openingMapDetailKey,
}: Props) {
  const userLocationMarkerRef = useRef<MapMarker | null>(null);

  const [isCenteringOnUser, setIsCenteringOnUser] = useState(false);

  const [userLocationMarker, setUserLocationMarker] = useState<UserLocationMarkerState | null>(null);
  const activeRef = useRef(false);
  const generationRef = useRef(0);
  const centeringRef = useRef(false);
  const calloutTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearCalloutTimers = useCallback(() => {
    calloutTimersRef.current.forEach(clearTimeout);
    calloutTimersRef.current = [];
  }, []);

  useEffect(() => {
    activeRef.current = isFocused && !openingMapDetailKey;
    centeringRef.current = false;
    setIsCenteringOnUser(false);
    return () => {
      activeRef.current = false;
      generationRef.current += 1;
      clearCalloutTimers();
    };
  }, [clearCalloutTimers, isFocused, openingMapDetailKey]);

  useEffect(() => {
    if (!isFocused || !liveUserCoordinate || ongoingDriverTrip) {
      return;
    }

    setUserLocationMarker((current) => ({
      coordinate: liveUserCoordinate,
      title: current?.title || 'Ma position',
      address: 'Position en temps réel',
    }));
  }, [isFocused, liveUserCoordinate, ongoingDriverTrip]);

  const showUserLocationCallout = useCallback(() => {
    clearCalloutTimers();
    if (!activeRef.current) return;
    calloutTimersRef.current = [140, 620].map((delay) => setTimeout(() => {
      if (activeRef.current) userLocationMarkerRef.current?.showCallout();
    }, delay));
  }, [clearCalloutTimers]);

  const handleReturnToUserLocation = useCallback(async () => {
    if (!activeRef.current || centeringRef.current) {
      return;
    }

    centeringRef.current = true;
    const generation = ++generationRef.current;
    const isCurrent = () => activeRef.current && generation === generationRef.current;
    setIsCenteringOnUser(true);

    try {
      const knownLatitude = Number(lastKnownLocation?.coords?.latitude);
      const knownLongitude = Number(lastKnownLocation?.coords?.longitude);
      const knownCoordinate =
        Number.isFinite(knownLatitude) && Number.isFinite(knownLongitude)
          ? { latitude: knownLatitude, longitude: knownLongitude }
          : null;
      const currentLocation = await getCurrentLocation();
      if (!isCurrent()) return;
      const coordinate =
        (currentLocation
          ? {
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
          }
          : null) ?? knownCoordinate;

      if (!coordinate) {
        showDialog({
          variant: 'warning',
          title: 'Localisation indisponible',
          message: 'Activez la localisation pour revenir à votre position sur la carte.',
        });
        return;
      }

      setUserLocationMarker({
        coordinate,
        title: 'Ma position',
        address: "Recherche de l'adresse actuelle...",
      });
      setMapFocusedOnUser(true);
      mapRef.current?.animateToRegion(
        {
          ...coordinate,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        },
        480,
      );
      showUserLocationCallout();

      const selection = await buildCurrentLocationSelection(coordinate);
      if (!isCurrent()) return;
      setUserLocationMarker({
        coordinate,
        title: selection.title || 'Ma position',
        address: selection.address,
      });
      showUserLocationCallout();
    } catch {
      if (isCurrent()) {
        showDialog({
          variant: 'warning',
          title: 'Localisation indisponible',
          message: 'Votre position ou son adresse ne peut pas être récupérée pour le moment. Réessayez dans quelques instants.',
        });
      }
    } finally {
      if (isCurrent()) {
        centeringRef.current = false;
        setIsCenteringOnUser(false);
      }
    }
  }, [getCurrentLocation, lastKnownLocation?.coords?.latitude, lastKnownLocation?.coords?.longitude, mapRef, setMapFocusedOnUser, showDialog, showUserLocationCallout]);
  return {
    userLocationMarker,
    userLocationMarkerRef,
    showUserLocationCallout,
    handleReturnToUserLocation,
    isCenteringOnUser,
  };
}
