import { NavigationContactModal } from '@/features/navigation/NavigationContactModal';
import { getDriverBookingContact } from '@/features/navigation/navigationContacts';
import type { useManageTripState } from '@/hooks/manage-trip/useManageTripState';
import type { Booking } from '@/types';
import React from 'react';

/** Resolve the selected reservation from fresh data, never a saved phone/name snapshot. */
export function ManageTripContactModal({ state, bookings }: {
  state: Pick<ReturnType<typeof useManageTripState>, 'isScreenActive' | 'isOwner' | 'contactBookingId' |
    'trip' | 'userId' | 'setContactBookingId'>;
  bookings: Booking[] | undefined;
}) {
  if (!state.isScreenActive || !state.isOwner || !state.contactBookingId) return null;
  const booking = bookings?.find(item => item.id === state.contactBookingId);
  const person = getDriverBookingContact(state.trip, booking, state.userId, true);
  return <NavigationContactModal role="driver" contacts={person ? [person] : []}
    onClose={() => state.setContactBookingId(null)} />;
}
