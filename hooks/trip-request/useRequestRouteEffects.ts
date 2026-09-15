import { type AddressInputMode } from '@/components/AddressEntryModeSelector';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { getMapCoordinate, getRenderableRouteCoordinates, LatLng } from '@/features/trip-request/requestFormModel';
import { useManualAddressGeocode } from '@/hooks/useManualAddressGeocode';
import { getRouteCoordinates } from '@/utils/routeApi';
import { useEffect } from 'react';
import { InteractionManager } from 'react-native';

interface Params {
  addressInputMode: AddressInputMode;
  departureManualAddress: string;
  departureLocation: MapLocationSelection | null;
  setDepartureLocation: (next: React.SetStateAction<MapLocationSelection | null>) => void;
  arrivalManualAddress: string;
  arrivalLocation: MapLocationSelection | null;
  setArrivalLocation: (next: React.SetStateAction<MapLocationSelection | null>) => void;
  setRouteCoordinates: React.Dispatch<React.SetStateAction<LatLng[]>>;
  setIsRouteLoading: React.Dispatch<React.SetStateAction<boolean>>;
  vehicleOptions: TripRequestVehiclePriceOption[];
  setSelectedVehicleType: (next: React.SetStateAction<TripRequestVehicleType>) => void;
  hasEditedBudget: boolean;
  setMaxPricePerSeat: (next: React.SetStateAction<string>) => void;
  recommendedPricePerSeat: number | null;
}

export function useRequestRouteEffects({
  addressInputMode,
  departureManualAddress,
  departureLocation,
  setDepartureLocation,
  arrivalManualAddress,
  arrivalLocation,
  setArrivalLocation,
  setRouteCoordinates,
  setIsRouteLoading,
  vehicleOptions,
  setSelectedVehicleType,
  hasEditedBudget,
  setMaxPricePerSeat,
  recommendedPricePerSeat,
}: Params) {
  const [departureManualGeocodeStatus, setDepartureManualGeocodeStatus] = useManualAddressGeocode({
    enabled: addressInputMode === 'manual', address: departureManualAddress,
    selection: departureLocation, onResolved: setDepartureLocation,
  });

  const [arrivalManualGeocodeStatus, setArrivalManualGeocodeStatus] = useManualAddressGeocode({
    enabled: addressInputMode === 'manual', address: arrivalManualAddress,
    selection: arrivalLocation, onResolved: setArrivalLocation,
  });

  useEffect(() => {
    const origin = getMapCoordinate(departureLocation);
    const destination = getMapCoordinate(arrivalLocation);

    if (!origin || !destination) {
      setRouteCoordinates([]);
      setIsRouteLoading(false);
      return;
    }

    let isCurrent = true;
    setIsRouteLoading(true);
    setRouteCoordinates([]);

    const interaction = InteractionManager.runAfterInteractions(() => {
      if (!isCurrent) return;

      getRouteCoordinates(origin, destination)
        .then((coordinates) => {
          if (!isCurrent) return;
          setRouteCoordinates(getRenderableRouteCoordinates(coordinates, origin, destination));
        })
        .catch((error) => {
          if (!isCurrent) return;
          console.warn('Impossible de calculer l itinéraire de demande', error);
          setRouteCoordinates([]);
        })
        .finally(() => {
          if (isCurrent) {
            setIsRouteLoading(false);
          }
        });
    });

    return () => {
      isCurrent = false;
      interaction.cancel();
    };
  }, [
    arrivalLocation,
    departureLocation,
  ]);

  useEffect(() => {
    if (!vehicleOptions.length) return;
    setSelectedVehicleType((current) => {
      const option = vehicleOptions.find((option) => option.vehicleType === current);
      return option?.availableForRequestedSeats ? current
        : vehicleOptions.find((option) => option.availableForRequestedSeats)?.vehicleType ?? current;
    });
  }, [vehicleOptions, setSelectedVehicleType]);

  useEffect(() => {
    if (hasEditedBudget) return;
    setMaxPricePerSeat(
      recommendedPricePerSeat === null ? '' : String(recommendedPricePerSeat),
    );
  }, [hasEditedBudget, recommendedPricePerSeat, setMaxPricePerSeat]);

  return {
    setDepartureManualGeocodeStatus,
    setArrivalManualGeocodeStatus,
    arrivalManualGeocodeStatus,
    departureManualGeocodeStatus,
  };
}
import type { TripRequestVehicleType } from '@/types';
import type { TripRequestVehiclePriceOption } from '@/store/api/tripRequestApi';
