import { type AddressInputMode } from '@/components/AddressEntryModeSelector';
import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import {
  areSameCoordinate,
  buildRoutePreviewRegion,
  clampRequestSeats,
  getMapCoordinate,
  LatLng,
  parseNumberParam,
  RequestFormStep,
} from '@/features/trip-request/requestFormModel';
import { buildCurrentLocationSelection } from '@/utils/currentLocationSelection';
import { useEffect, useMemo } from 'react';
import { type Region } from 'react-native-maps';

interface Params {
  screenMountedRef: React.RefObject<boolean>;
  departureLocation: MapLocationSelection | null;
  arrivalLocation: MapLocationSelection | null;
  routeCoordinates: LatLng[];
  favoriteLocations: FavoriteLocation[];
  hasAppliedRoutePrefill: boolean;
  requestParams: { arrival?: string; departure?: string; minSeats?: string; seats?: string; };
  setNumberOfSeats: (next: React.SetStateAction<number>) => void;
  setHasAppliedRoutePrefill: React.Dispatch<React.SetStateAction<boolean>>;
  setAddressInputMode: React.Dispatch<React.SetStateAction<AddressInputMode>>;
  setRequestFormStep: React.Dispatch<React.SetStateAction<RequestFormStep>>;
  departureTouchedRef: React.RefObject<boolean>;
  setDepartureLocation: (next: React.SetStateAction<MapLocationSelection | null>) => void;
  setDepartureManualAddress: (next: React.SetStateAction<string>) => void;
  setArrivalLocation: (next: React.SetStateAction<MapLocationSelection | null>) => void;
  setArrivalManualAddress: (next: React.SetStateAction<string>) => void;
  setAddressSectionStep: React.Dispatch<React.SetStateAction<AddressSectionStep>>;
  departureAutoFillStartedRef: React.RefObject<boolean>;
  departureManualAddress: string;
  lastKnownLocation: ReturnType<typeof useUserLocation>['lastKnownLocation'];
  getCurrentLocation: () => Promise<LocationObject | null>;
}

export function useRequestRoutePrefill({
  screenMountedRef,
  departureLocation,
  arrivalLocation,
  routeCoordinates,
  favoriteLocations,
  hasAppliedRoutePrefill,
  requestParams,
  setNumberOfSeats,
  setHasAppliedRoutePrefill,
  setAddressInputMode,
  setRequestFormStep,
  departureTouchedRef,
  setDepartureLocation,
  setDepartureManualAddress,
  setArrivalLocation,
  setArrivalManualAddress,
  setAddressSectionStep,
  departureAutoFillStartedRef,
  departureManualAddress,
  lastKnownLocation,
  getCurrentLocation,
}: Params) {
  useEffect(() => {
    screenMountedRef.current = true;
    return () => {
      screenMountedRef.current = false;
    };
  }, []);

  const routePreviewRegion = useMemo<Region>(() => {
    const selectedPoints = [getMapCoordinate(departureLocation), getMapCoordinate(arrivalLocation)].filter(
      (point): point is LatLng => Boolean(point),
    );
    const previewPoints = routeCoordinates.length > 1 ? routeCoordinates : selectedPoints;

    return buildRoutePreviewRegion(previewPoints);
  }, [
    arrivalLocation,
    departureLocation,
    routeCoordinates,
  ]);

  const favoriteSuggestions = useMemo(() => favoriteLocations.slice(0, 4), [favoriteLocations]);

  useEffect(() => {
    if (hasAppliedRoutePrefill) {
      return;
    }

    const departureParam = typeof requestParams.departure === 'string' ? requestParams.departure.trim() : '';
    const arrivalParam = typeof requestParams.arrival === 'string' ? requestParams.arrival.trim() : '';
    const seatsParam = parseNumberParam(requestParams.seats) ?? parseNumberParam(requestParams.minSeats);

    if (seatsParam !== undefined) {
      setNumberOfSeats(clampRequestSeats(seatsParam));
    }

    if (!departureParam && !arrivalParam) {
      setHasAppliedRoutePrefill(true);
      return;
    }

    setAddressInputMode('manual');
    setRequestFormStep('route');

    if (departureParam) {
      departureTouchedRef.current = true;
      setDepartureLocation(null);
      setDepartureManualAddress(departureParam);
    }

    if (arrivalParam) {
      setArrivalLocation(null);
      setArrivalManualAddress(arrivalParam);
    }

    setAddressSectionStep(!departureParam ? 'departure' : 'arrival');
    setHasAppliedRoutePrefill(true);
  }, [
    hasAppliedRoutePrefill,
    requestParams.arrival,
    requestParams.departure,
    requestParams.minSeats,
    requestParams.seats,
    setArrivalLocation,
    setArrivalManualAddress,
    setDepartureLocation,
    setDepartureManualAddress,
    setNumberOfSeats,
  ]);

  useEffect(() => {
    if (
      !hasAppliedRoutePrefill ||
      departureAutoFillStartedRef.current ||
      departureTouchedRef.current ||
      departureLocation ||
      departureManualAddress.trim()
    ) {
      return;
    }

    departureAutoFillStartedRef.current = true;

    const initializeDeparture = async () => {
      const applyCoordinate = async (coordinate: LatLng) => {
        const selection = await buildCurrentLocationSelection(coordinate);
        if (!screenMountedRef.current || departureTouchedRef.current) {
          return false;
        }

        setDepartureLocation(selection);
        setDepartureManualAddress(selection.title || selection.address);
        setAddressSectionStep('arrival');
        return true;
      };
      const knownLatitude = Number(lastKnownLocation?.coords?.latitude);
      const knownLongitude = Number(lastKnownLocation?.coords?.longitude);
      const knownTimestamp = Number(lastKnownLocation?.timestamp);
      const knownCoordinate =
        Number.isFinite(knownLatitude) &&
          Number.isFinite(knownLongitude) &&
          Number.isFinite(knownTimestamp) &&
          Date.now() - knownTimestamp <= 15 * 60 * 1000
          ? { latitude: knownLatitude, longitude: knownLongitude }
          : null;

      if (knownCoordinate) {
        await applyCoordinate(knownCoordinate);
      }

      if (!screenMountedRef.current || departureTouchedRef.current) {
        return;
      }

      const position = await getCurrentLocation();
      if (!screenMountedRef.current || !position || departureTouchedRef.current) {
        return;
      }

      const currentCoordinate = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      if (knownCoordinate && areSameCoordinate(knownCoordinate, currentCoordinate)) {
        return;
      }

      await applyCoordinate(currentCoordinate);
    };

    void initializeDeparture();
  }, [
    departureLocation,
    departureManualAddress,
    getCurrentLocation,
    hasAppliedRoutePrefill,
    lastKnownLocation,
    setDepartureLocation,
    setDepartureManualAddress,
  ]);

  return {
    favoriteSuggestions,
    routePreviewRegion,
  };
}
import type { FavoriteLocation } from '@/types';
import type { LocationObject } from 'expo-location';
import type { useUserLocation } from '@/hooks/useUserLocation';
