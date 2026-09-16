import type { MapLocationSelection } from '@/components/LocationPickerModal';
import type { RoutePointStatus } from '@/features/publish/publishModel';
import type { LatLng } from '@/features/publish/publishModel';
import { getMapCoordinate, getRenderableRouteCoordinates } from '../../features/publish/publishModel';
import { useManualAddressGeocode } from '@/hooks/useManualAddressGeocode';
import { getRouteCoordinates } from '@/utils/routeApi';
import React, { useEffect } from 'react';
import { InteractionManager } from 'react-native';

interface Params {
  manualAddressTarget: "departure" | "arrival" | null;
  departureManualAddress: string;
  departureLocation: MapLocationSelection | null;
  setDepartureLocation: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setDeparturePointStatus: React.Dispatch<React.SetStateAction<RoutePointStatus>>;
  arrivalManualAddress: string;
  arrivalLocation: MapLocationSelection | null;
  setArrivalLocation: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setArrivalPointStatus: React.Dispatch<React.SetStateAction<RoutePointStatus>>;
  setRouteCoordinates: React.Dispatch<React.SetStateAction<LatLng[]>>;
  setIsRouteLoading: React.Dispatch<React.SetStateAction<boolean>>;
  mode: string | undefined;
  isRecurringTrip: boolean;
  setIsRecurringTrip: React.Dispatch<React.SetStateAction<boolean>>;
  recurringWeekdays: number[];
  setRecurringWeekdays: React.Dispatch<React.SetStateAction<number[]>>;
  toIsoWeekday: (date: Date) => number;
  departureDateTime: Date | null;
}

export function usePublishRouteResolution({
  manualAddressTarget,
  departureManualAddress,
  departureLocation,
  setDepartureLocation,
  setDeparturePointStatus,
  arrivalManualAddress,
  arrivalLocation,
  setArrivalLocation,
  setArrivalPointStatus,
  setRouteCoordinates,
  setIsRouteLoading,
  mode,
  isRecurringTrip,
  setIsRecurringTrip,
  recurringWeekdays,
  setRecurringWeekdays,
  toIsoWeekday,
  departureDateTime,
}: Params) {
  const [departureManualGeocodeStatus] = useManualAddressGeocode({
    enabled: manualAddressTarget === 'departure', address: departureManualAddress,
    selection: departureLocation, onResolved: (selection) => {
      setDepartureLocation(selection);
      setDeparturePointStatus('suggested');
    }, onMissing: () => setDeparturePointStatus(null),
  });

  const [arrivalManualGeocodeStatus] = useManualAddressGeocode({
    enabled: manualAddressTarget === 'arrival', address: arrivalManualAddress,
    selection: arrivalLocation, onResolved: (selection) => {
      setArrivalLocation(selection);
      setArrivalPointStatus('suggested');
    }, onMissing: () => setArrivalPointStatus(null),
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
          console.warn("Impossible de calculer l'itinéraire de publication", error);
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
  }, [arrivalLocation, departureLocation]);

  useEffect(() => {
    if (mode !== 'recurring' || isRecurringTrip) {
      return;
    }

    setIsRecurringTrip(true);
    if (recurringWeekdays.length === 0) {
      setRecurringWeekdays([toIsoWeekday(departureDateTime ?? new Date())]);
    }
  }, [mode, isRecurringTrip, recurringWeekdays.length, departureDateTime]);

  return {
    departureManualGeocodeStatus,
    arrivalManualGeocodeStatus,
  };
}
