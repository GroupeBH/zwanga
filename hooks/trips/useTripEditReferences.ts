import { useCallback, useState } from 'react';
import type { Trip } from '@/types';
import type { MapLocationSelection } from '@/features/location-picker/locationPickerModel';

/** Repères kept separately from the geocoded addresses, as in publication. */
export function useTripEditReferences() {
  const [departureReference, setDepartureReference] = useState('');
  const [arrivalReference, setArrivalReference] = useState('');
  const reset = useCallback((trip?: Trip) => {
    setDepartureReference(trip?.departure?.reference ?? '');
    setArrivalReference(trip?.arrival?.reference ?? '');
  }, []);
  const swap = () => {
    setDepartureReference(arrivalReference);
    setArrivalReference(departureReference);
  };
  const clearIfAddressChanged = (target: 'departure' | 'arrival', next: string, previous: string) => {
    if (next.trim().toLowerCase() === previous.trim().toLowerCase()) return;
    (target === 'departure' ? setDepartureReference : setArrivalReference)('');
  };
  const clearIfLocationChanged = (target: 'departure' | 'arrival', next: MapLocationSelection, previous: MapLocationSelection | null) => {
    if (previous && next.latitude === previous.latitude && next.longitude === previous.longitude &&
      (next.title || next.address) === (previous.title || previous.address)) return;
    (target === 'departure' ? setDepartureReference : setArrivalReference)('');
  };
  return { departureReference, arrivalReference, setDepartureReference, setArrivalReference,
    reset, swap, clearIfAddressChanged, clearIfLocationChanged };
}

export type TripEditReferences = ReturnType<typeof useTripEditReferences>;
