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
import { getRequestArrivalSelection, getRequestDepartureSelection, type RequestArrivalParams, type RequestDepartureParams } from '@/utils/requestNavigation';
import { useEffect, useMemo } from 'react';
import { type Region } from 'react-native-maps';
import type { FavoriteLocation } from '@/types';
import type { LocationObject } from 'expo-location';
import type { useUserLocation } from '@/hooks/useUserLocation';

interface Params {
  screenMountedRef: React.RefObject<boolean>;
  departureLocation: MapLocationSelection | null;
  arrivalLocation: MapLocationSelection | null;
  routeCoordinates: LatLng[];
  favoriteLocations: FavoriteLocation[];
  hasAppliedRoutePrefill: boolean;
  requestParams: RequestDepartureParams & RequestArrivalParams & { entry?: string; minSeats?: string; seats?: string; };
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
  }, [screenMountedRef]);

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
    const confirmedDeparture = getRequestDepartureSelection(requestParams);
    const confirmedArrival = getRequestArrivalSelection(requestParams);
    const seatsParam = parseNumberParam(requestParams.seats) ?? parseNumberParam(requestParams.minSeats);

    if (seatsParam !== undefined) {
      setNumberOfSeats(clampRequestSeats(seatsParam));
    }

    if (!departureParam && !arrivalParam && !confirmedDeparture && !confirmedArrival) {
      setHasAppliedRoutePrefill(true);
      return;
    }

    setAddressInputMode(confirmedArrival || (confirmedDeparture && !arrivalParam) ? 'map' : 'manual');
    setRequestFormStep('route');

    if (departureParam || confirmedDeparture) {
      departureTouchedRef.current = true;
      setDepartureLocation(confirmedDeparture);
      setDepartureManualAddress(confirmedDeparture?.title || departureParam);
    }

    if (arrivalParam || confirmedArrival) {
      setArrivalLocation(confirmedArrival);
      setArrivalManualAddress(confirmedArrival?.title || arrivalParam);
    }

    setAddressSectionStep(!departureParam && !confirmedDeparture ? 'departure' : 'arrival');
    setHasAppliedRoutePrefill(true);
  }, [
    hasAppliedRoutePrefill,
    requestParams,
    departureTouchedRef,
    setAddressInputMode,
    setAddressSectionStep,
    setHasAppliedRoutePrefill,
    setRequestFormStep,
    setArrivalLocation,
    setArrivalManualAddress,
    setDepartureLocation,
    setDepartureManualAddress,
    setNumberOfSeats,
  ]);

  useEffect(() => {
    if (
      requestParams.entry === 'home' || // Home owns a bounded current-position flow, with an explicit manual fallback.
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

    // GPS and reverse lookup are conveniences, not prerequisites for manual map selection.
    void initializeDeparture().catch(() => {});
  }, [
    requestParams.entry,
    departureAutoFillStartedRef,
    departureTouchedRef,
    screenMountedRef,
    setAddressSectionStep,
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
