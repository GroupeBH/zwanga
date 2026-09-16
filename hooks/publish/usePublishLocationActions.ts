import { RoutePointStatus } from '../../features/publish/publishModel';
import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import React from 'react';

interface Params {
  departureTouchedRef: React.RefObject<boolean>;
  setLocationPickerInitialQuery: React.Dispatch<React.SetStateAction<string>>;
  setActiveLocationType: React.Dispatch<React.SetStateAction<"departure" | "arrival" | null>>;
  departureLocation: MapLocationSelection | null;
  departurePointStatus: RoutePointStatus;
  departureManualAddress: string;
  departureReference: string;
  showDepartureReference: boolean;
  setDepartureLocation: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  arrivalLocation: MapLocationSelection | null;
  setDeparturePointStatus: React.Dispatch<React.SetStateAction<RoutePointStatus>>;
  arrivalPointStatus: RoutePointStatus;
  setDepartureManualAddress: React.Dispatch<React.SetStateAction<string>>;
  arrivalManualAddress: string;
  setDepartureReference: React.Dispatch<React.SetStateAction<string>>;
  arrivalReference: string;
  setShowDepartureReference: React.Dispatch<React.SetStateAction<boolean>>;
  showArrivalReference: boolean;
  setArrivalLocation: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setArrivalPointStatus: React.Dispatch<React.SetStateAction<RoutePointStatus>>;
  setArrivalManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setArrivalReference: React.Dispatch<React.SetStateAction<string>>;
  setShowArrivalReference: React.Dispatch<React.SetStateAction<boolean>>;
  setManualAddressTarget: React.Dispatch<React.SetStateAction<"departure" | "arrival" | null>>;
  activeLocationType: "departure" | "arrival" | null;
  setAddressSectionStep: React.Dispatch<React.SetStateAction<AddressSectionStep>>;
}

export function usePublishLocationActions({
  departureTouchedRef,
  setLocationPickerInitialQuery,
  setActiveLocationType,
  departureLocation,
  departurePointStatus,
  departureManualAddress,
  departureReference,
  showDepartureReference,
  setDepartureLocation,
  arrivalLocation,
  setDeparturePointStatus,
  arrivalPointStatus,
  setDepartureManualAddress,
  arrivalManualAddress,
  setDepartureReference,
  arrivalReference,
  setShowDepartureReference,
  showArrivalReference,
  setArrivalLocation,
  setArrivalPointStatus,
  setArrivalManualAddress,
  setArrivalReference,
  setShowArrivalReference,
  setManualAddressTarget,
  activeLocationType,
  setAddressSectionStep,
}: Params) {
  const openLocationPicker = (type: 'departure' | 'arrival', initialQuery = '') => {
    if (type === 'departure') {
      departureTouchedRef.current = true;
    }
    setLocationPickerInitialQuery(initialQuery);
    setActiveLocationType(type);
  };

  const closeLocationPicker = () => {
    setActiveLocationType(null);
    setLocationPickerInitialQuery('');
  };

  const swapRoutePoints = () => {
    departureTouchedRef.current = true;
    const tempLoc = departureLocation;
    const tempStatus = departurePointStatus;
    const tempManual = departureManualAddress;
    const tempRef = departureReference;
    const tempShowRef = showDepartureReference;
    setDepartureLocation(arrivalLocation);
    setDeparturePointStatus(arrivalPointStatus);
    setDepartureManualAddress(arrivalManualAddress);
    setDepartureReference(arrivalReference);
    setShowDepartureReference(showArrivalReference);
    setArrivalLocation(tempLoc);
    setArrivalPointStatus(tempStatus);
    setArrivalManualAddress(tempManual);
    setArrivalReference(tempRef);
    setShowArrivalReference(tempShowRef);
  };

  const handleLocationSelected = (selection: MapLocationSelection) => {
    setManualAddressTarget(null);
    if (activeLocationType === 'departure') {
      departureTouchedRef.current = true;
      setDepartureLocation(selection);
      setDeparturePointStatus('confirmed');
      setDepartureManualAddress(selection.title || selection.address);
      setAddressSectionStep('arrival');
    } else if (activeLocationType === 'arrival') {
      setArrivalLocation(selection);
      setArrivalPointStatus('confirmed');
      setArrivalManualAddress(selection.title || selection.address);
    }
    closeLocationPicker();
  };

  return {
    openLocationPicker,
    swapRoutePoints,
    closeLocationPicker,
    handleLocationSelected,
  };
}
