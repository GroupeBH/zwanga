import {
  LatLng,
  RoutePointStatus,
  getLocationText,
  getMapCoordinate,
  areSameCoordinate,
  buildRoutePreviewRegion,
} from '../../features/publish/publishModel';
import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { buildCurrentLocationSelection } from '@/utils/currentLocationSelection';
import React, { useEffect, useMemo } from 'react';
import { type Region } from 'react-native-maps';

interface Params {
  manualAddressTarget: "departure" | "arrival" | null;
  departureManualAddress: string;
  departureLocation: MapLocationSelection | null;
  arrivalManualAddress: string;
  arrivalLocation: MapLocationSelection | null;
  departurePointStatus: RoutePointStatus;
  arrivalPointStatus: RoutePointStatus;
  showDepartureReference: boolean;
  departureReference: string;
  showArrivalReference: boolean;
  arrivalReference: string;
  routeCoordinates: LatLng[];
  departureAutoFillStartedRef: React.RefObject<boolean>;
  departureTouchedRef: React.RefObject<boolean>;
  setManualAddressTarget: React.Dispatch<React.SetStateAction<"departure" | "arrival" | null>>;
  setDepartureLocation: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setDeparturePointStatus: React.Dispatch<React.SetStateAction<RoutePointStatus>>;
  setDepartureManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setAddressSectionStep: React.Dispatch<React.SetStateAction<AddressSectionStep>>;
  lastKnownLocation: ReturnType<typeof useUserLocation>['lastKnownLocation'];
  getCurrentLocation: () => Promise<LocationObject | null>;
}

export function usePublishRoutePreview({
  manualAddressTarget,
  departureManualAddress,
  departureLocation,
  arrivalManualAddress,
  arrivalLocation,
  departurePointStatus,
  arrivalPointStatus,
  showDepartureReference,
  departureReference,
  showArrivalReference,
  arrivalReference,
  routeCoordinates,
  departureAutoFillStartedRef,
  departureTouchedRef,
  setManualAddressTarget,
  setDepartureLocation,
  setDeparturePointStatus,
  setDepartureManualAddress,
  setAddressSectionStep,
  lastKnownLocation,
  getCurrentLocation,
}: Params) {
  const departureAddress =
    manualAddressTarget === 'departure'
      ? departureManualAddress.trim()
      : getLocationText(departureLocation, '');
  const arrivalAddress =
    manualAddressTarget === 'arrival'
      ? arrivalManualAddress.trim()
      : getLocationText(arrivalLocation, '');
  const hasDepartureAddress = departureAddress.length > 0;
  const hasArrivalAddress = arrivalAddress.length > 0;
  const hasDepartureGpsSuggestion = Boolean(getMapCoordinate(departureLocation));
  const hasArrivalGpsSuggestion = Boolean(getMapCoordinate(arrivalLocation));
  const hasDepartureCoordinates = hasDepartureGpsSuggestion && departurePointStatus === 'confirmed';
  const hasArrivalCoordinates = hasArrivalGpsSuggestion && arrivalPointStatus === 'confirmed';
  const shouldShowDepartureReference = showDepartureReference || departureReference.trim().length > 0;
  const shouldShowArrivalReference = showArrivalReference || arrivalReference.trim().length > 0;
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

  useEffect(() => {
    if (
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
        if (departureTouchedRef.current) {
          return false;
        }

        setManualAddressTarget(null);
        setDepartureLocation(selection);
        setDeparturePointStatus('confirmed');
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

      if (departureTouchedRef.current) {
        return;
      }

      const position = await getCurrentLocation();
      if (!position || departureTouchedRef.current) {
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
  }, [departureLocation, departureManualAddress, getCurrentLocation, lastKnownLocation]);

  return {
    hasDepartureCoordinates,
    hasArrivalCoordinates,
    departureAddress,
    arrivalAddress,
    hasDepartureAddress,
    hasArrivalAddress,
    hasDepartureGpsSuggestion,
    shouldShowDepartureReference,
    hasArrivalGpsSuggestion,
    shouldShowArrivalReference,
    routePreviewRegion,
  };
}
import type { LocationObject } from 'expo-location';
import type { useUserLocation } from '@/hooks/useUserLocation';
