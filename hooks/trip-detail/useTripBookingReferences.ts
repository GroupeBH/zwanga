import { useState } from 'react';
import { bookingReferenceContext, type BookingReferenceTarget } from '@/features/trip-detail/bookingReferences';
import type { MapLocationSelection } from '@/features/location-picker/locationPickerModel';
import type { Trip } from '@/types';

type Entry = { key: string; value: string } | null;
export function useTripBookingReferences({ trip, passengerOrigin, passengerOriginManualAddress,
  passengerDestination, passengerDestinationManualAddress }: {
  trip: Trip | undefined; passengerOrigin: MapLocationSelection | null; passengerOriginManualAddress: string;
  passengerDestination: MapLocationSelection | null; passengerDestinationManualAddress: string;
}) {
  const [entries, setEntries] = useState<{ origin: Entry; destination: Entry }>({ origin: null, destination: null });
  const field = (target: BookingReferenceTarget, selection: MapLocationSelection | null, manual: string) => {
    const context = bookingReferenceContext(trip, target, selection, manual);
    const saved = entries[target];
    return { ...context, value: saved?.key === context.key ? saved.value : context.inheritedReference,
      onChangeText: (value: string) => setEntries(previous => ({ ...previous, [target]: { key: context.key, value } })) };
  };
  return {
    origin: field('origin', passengerOrigin, passengerOriginManualAddress),
    destination: field('destination', passengerDestination, passengerDestinationManualAddress),
    reset: () => setEntries({ origin: null, destination: null }),
  };
}
export type TripBookingReferences = ReturnType<typeof useTripBookingReferences>;
