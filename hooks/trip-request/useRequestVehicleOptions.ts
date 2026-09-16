import type { MapLocationSelection } from '@/components/LocationPickerModal';
import { getLocationCoordinates } from '@/features/trip-request/requestFormModel';
import { useTripRequestVehicleOptionsQuery, type TripRequestVehiclePriceOption } from '@/store/api/tripRequestApi';
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';

const EMPTY_OPTIONS: TripRequestVehiclePriceOption[] = [];
interface Options {
  enabled?: boolean;
  departureAddress: string; arrivalAddress: string;
  departureReference: string; arrivalReference: string;
  departureLocation: MapLocationSelection | null; arrivalLocation: MapLocationSelection | null;
  numberOfSeats: number; hasSpecifiedNumberOfSeats: boolean;
}

/** Server recommendations stay in the RTK Query cache, separate from the user's budget. */
export function useRequestVehicleOptions(options: Options) {
  const {
    enabled = true,
    departureAddress,
    arrivalAddress,
    departureReference,
    arrivalReference,
    departureLocation,
    arrivalLocation,
    numberOfSeats,
    hasSpecifiedNumberOfSeats
  } = options;
  const validSeats = !hasSpecifiedNumberOfSeats || (Number.isSafeInteger(numberOfSeats) && numberOfSeats >= 1);
  const args = useMemo(() => departureAddress && arrivalAddress && validSeats ? {
    departureLocation: departureAddress, arrivalLocation: arrivalAddress,
    departureReference: departureReference.trim() || undefined, arrivalReference: arrivalReference.trim() || undefined,
    departureCoordinates: getLocationCoordinates(departureLocation), arrivalCoordinates: getLocationCoordinates(arrivalLocation),
    ...(hasSpecifiedNumberOfSeats ? { numberOfSeats } : {}),
  } : null, [departureAddress, arrivalAddress, departureReference, arrivalReference, departureLocation, arrivalLocation, numberOfSeats, hasSpecifiedNumberOfSeats, validSeats]);
  const key = JSON.stringify(args);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let interaction: ReturnType<typeof InteractionManager.runAfterInteractions> | undefined;
    const timer = setTimeout(() => {
      interaction = InteractionManager.runAfterInteractions(() => setReadyKey(key));
    }, 250);
    return () => { clearTimeout(timer); interaction?.cancel(); };
  }, [enabled, key]);
  const queryArgs = enabled && args && readyKey === key ? args : skipToken;
  const { currentData, isFetching, isError, refetch } = useTripRequestVehicleOptionsQuery(queryArgs, {
    refetchOnMountOrArgChange: 30,
  });
  const result = queryArgs === skipToken ? undefined : currentData;
  return {
    pricingKey: key,
    vehicleOptions: result?.options ?? EMPTY_OPTIONS,
    vehiclePriceMultiplier: result?.weatherImpact?.priceMultiplier ?? 1,
    routeDistanceMeters: result?.distanceMeters ?? null,
    isPriceLoading: enabled && Boolean(args) && (readyKey !== key || isFetching),
    isVehicleOptionsError: queryArgs !== skipToken && isError,
    retryVehicleOptions: () => { if (queryArgs !== skipToken) void refetch(); },
  };
}
