import type { MapLocationSelection } from '@/components/LocationPickerModal';
import { getLocationCoordinates } from '@/features/trip-request/requestFormModel';
import { useTripRequestVehicleOptionsQuery, type TripRequestVehiclePriceOption } from '@/store/api/tripRequestApi';
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';

const EMPTY_OPTIONS: TripRequestVehiclePriceOption[] = [];
interface Options {
  departureAddress: string; arrivalAddress: string;
  departureReference: string; arrivalReference: string;
  departureLocation: MapLocationSelection | null; arrivalLocation: MapLocationSelection | null;
  numberOfSeats: number; hasSpecifiedNumberOfSeats: boolean;
}

/** Server recommendations stay in the RTK Query cache, separate from the user's budget. */
export function useRequestVehicleOptions(options: Options) {
  const {
    departureAddress,
    arrivalAddress,
    departureReference,
    arrivalReference,
    departureLocation,
    arrivalLocation,
    numberOfSeats,
    hasSpecifiedNumberOfSeats
  } = options;
  const args = useMemo(() => departureAddress && arrivalAddress ? {
    departureLocation: departureAddress, arrivalLocation: arrivalAddress,
    departureReference: departureReference.trim() || undefined, arrivalReference: arrivalReference.trim() || undefined,
    departureCoordinates: getLocationCoordinates(departureLocation), arrivalCoordinates: getLocationCoordinates(arrivalLocation),
    ...(hasSpecifiedNumberOfSeats ? { numberOfSeats } : {}),
  } : null, [departureAddress, arrivalAddress, departureReference, arrivalReference, departureLocation, arrivalLocation, numberOfSeats, hasSpecifiedNumberOfSeats]);
  const key = JSON.stringify(args);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  useEffect(() => {
    let interaction: ReturnType<typeof InteractionManager.runAfterInteractions> | undefined;
    const timer = setTimeout(() => {
      interaction = InteractionManager.runAfterInteractions(() => setReadyKey(key));
    }, 250);
    return () => { clearTimeout(timer); interaction?.cancel(); };
  }, [key]);
  const queryArgs = args && readyKey === key ? args : skipToken;
  const { currentData, isFetching, isError, refetch } = useTripRequestVehicleOptionsQuery(queryArgs);
  const result = queryArgs === skipToken ? undefined : currentData;
  return {
    vehicleOptions: result?.options ?? EMPTY_OPTIONS,
    routeDistanceMeters: result?.distanceMeters ?? null,
    isPriceLoading: Boolean(args) && (readyKey !== key || isFetching),
    isVehicleOptionsError: queryArgs !== skipToken && isError,
    retryVehicleOptions: () => { if (queryArgs !== skipToken) void refetch(); },
  };
}
