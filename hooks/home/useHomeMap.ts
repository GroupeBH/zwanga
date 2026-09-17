import { KINSHASA_REGION } from '@/features/home/homeMapPolicy';
import { useHomeMapCamera } from './useHomeMapCamera';
import { getLocationCoordinate, getTripMapCoordinate } from '@/features/home/homeModel';
import {
  getTripLocationCoordinate
} from '@/utils/tripCoordinates';
import { useEffect, useMemo, useRef, useState } from 'react';
import MapView, { type MapMarker, type Region } from 'react-native-maps';

import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeDriverActivity } from '@/hooks/home/useHomeDriverActivity';
import type { useHomeLocation } from '@/hooks/home/useHomeLocation';
import type { useHomeMapNavigation } from '@/hooks/home/useHomeMapNavigation';
import type { useHomePassengerActivity } from '@/hooks/home/useHomePassengerActivity';
import type { useHomePassengerMarkers } from '@/hooks/home/useHomePassengerMarkers';
import type { useHomeTripSelection } from '@/hooks/home/useHomeTripSelection';
type Props =
  Pick<ReturnType<typeof useHomeContext>,
    'isFocused'
  >
  & Pick<ReturnType<typeof useHomeTripSelection>,
    'homeMapTrips'
    | 'isHomeSheetLockedRetracted'
  >
  & Pick<ReturnType<typeof useHomeDriverActivity>,
    'ongoingDriverTrip'
  >
  & Pick<ReturnType<typeof useHomeLocation>,
    'liveUserCoordinate'
  >
  & Pick<ReturnType<typeof useHomePassengerActivity>,
    'availableDriverRequests'
  >
  & Pick<ReturnType<typeof useHomePassengerMarkers>,
    'visibleDriverPassengerMarkers'
  >
  & Pick<ReturnType<typeof useHomeMapNavigation>,
    'openingMapDetailKey'
  >;
export function useHomeMap({
  isFocused,
  homeMapTrips,
  ongoingDriverTrip,
  liveUserCoordinate,
  isHomeSheetLockedRetracted,
  availableDriverRequests,
  visibleDriverPassengerMarkers,
  openingMapDetailKey,
}: Props) {
  const mapRef = useRef<MapView>(null);

  const tripMarkerRefs = useRef<Record<string, MapMarker | null>>({});

  const passengerMarkerRefs = useRef<Record<string, MapMarker | null>>({});

  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  const [loadedTripMarkerKeys, setLoadedTripMarkerKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setLoadedTripMarkerKeys(new Set());
  }, [isFocused, ongoingDriverTrip?.id]);

  const [mapFocusedOnUser, setMapFocusedOnUser] = useState(false);

  const tripsWithMapCoordinates = useMemo(
    () =>
      homeMapTrips.filter((trip) =>
        Boolean(
          getTripMapCoordinate(
            trip,
            trip.id === ongoingDriverTrip?.id ? liveUserCoordinate : null,
          ),
        ),
      ),
    [homeMapTrips, liveUserCoordinate, ongoingDriverTrip?.id],
  );

  const tripRequestsWithMapCoordinates = useMemo(() => {
    if (isHomeSheetLockedRetracted) {
      return [];
    }

    return availableDriverRequests.flatMap((request) => {
      const coordinate = getTripLocationCoordinate(request.departure);
      return coordinate ? [{ request, coordinate }] : [];
    });
  }, [availableDriverRequests, isHomeSheetLockedRetracted]);

  useEffect(() => {
    if (homeMapTrips.length === 0) {
      setSelectedTripId(null);
      return;
    }

    if (selectedTripId && homeMapTrips.some((trip) => trip.id === selectedTripId)) {
      return;
    }

    setSelectedTripId(tripsWithMapCoordinates[0]?.id ?? homeMapTrips[0].id);
  }, [homeMapTrips, selectedTripId, tripsWithMapCoordinates]);

  const selectedTrip = useMemo(
    () => homeMapTrips.find((trip) => trip.id === selectedTripId) ?? homeMapTrips[0] ?? null,
    [homeMapTrips, selectedTripId],
  );

  const mapRegion = useMemo<Region>(() => {
    const selectedDeparture = selectedTrip ? getLocationCoordinate(selectedTrip.departure) : null;
    const selectedMapCoordinate = selectedTrip
      ? getTripMapCoordinate(
        selectedTrip,
        selectedTrip.id === ongoingDriverTrip?.id ? liveUserCoordinate : null,
      )
      : null;
    const fallbackDeparture = tripsWithMapCoordinates[0]
      ? getTripMapCoordinate(
        tripsWithMapCoordinates[0],
        tripsWithMapCoordinates[0].id === ongoingDriverTrip?.id ? liveUserCoordinate : null,
      )
      : null;
    const fallbackRequestDeparture = tripRequestsWithMapCoordinates[0]?.coordinate ?? null;
    const coordinate = selectedMapCoordinate ?? selectedDeparture ?? fallbackDeparture ?? fallbackRequestDeparture;

    if (ongoingDriverTrip && selectedMapCoordinate && visibleDriverPassengerMarkers.length > 0) {
      const coordinates = [
        selectedMapCoordinate,
        ...visibleDriverPassengerMarkers.map((passenger) => passenger.coordinate),
      ];
      const latitudes = coordinates.map((point) => point.latitude);
      const longitudes = coordinates.map((point) => point.longitude);
      const minLatitude = Math.min(...latitudes);
      const maxLatitude = Math.max(...latitudes);
      const minLongitude = Math.min(...longitudes);
      const maxLongitude = Math.max(...longitudes);

      return {
        latitude: (minLatitude + maxLatitude) / 2,
        longitude: (minLongitude + maxLongitude) / 2,
        latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.5, 0.035),
        longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.5, 0.035),
      };
    }

    if (!coordinate) {
      return KINSHASA_REGION;
    }

    return {
      ...coordinate,
      latitudeDelta: 0.065,
      longitudeDelta: 0.065,
    };
  }, [
    visibleDriverPassengerMarkers,
    liveUserCoordinate,
    ongoingDriverTrip,
    selectedTrip,
    tripRequestsWithMapCoordinates,
    tripsWithMapCoordinates,
  ]);

  const cameraRegion = mapFocusedOnUser && liveUserCoordinate
    ? { ...liveUserCoordinate, latitudeDelta: 0.025, longitudeDelta: 0.025 } : mapRegion;
  useHomeMapCamera(mapRef, isFocused && !openingMapDetailKey, cameraRegion);
  return {
    setMapFocusedOnUser,
    mapRef,
    mapRegion,
    tripsWithMapCoordinates,
    selectedTrip,
    tripMarkerRefs,
    setLoadedTripMarkerKeys,
    tripRequestsWithMapCoordinates,
    passengerMarkerRefs,
    loadedTripMarkerKeys,
  };
}
