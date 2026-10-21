import type { AppDispatch, RootState } from '@/store';
import type { VerifiedBookingEntry } from '@/features/navigation/pendingBookingEntry';
import { ownsTrip } from '@/features/activity/tripParticipation';
import { tripApi } from '@/store/api/tripApi';

/** Seed only a missing detail, never overwrite a concurrent read or a newer
 * trip. A selected booking is NOT the full passenger list. No persistence. */
export const primePendingBookingTrip = ({ booking, trip }: VerifiedBookingEntry, userId: string) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState();
    if (state.auth.user?.id !== userId || !ownsTrip(trip, userId) || booking.tripId !== trip.id ||
      booking.status !== 'pending' || booking.passengerId === userId || trip.status !== 'upcoming') return;
    const cached = tripApi.endpoints.getTripById.select(trip.id)(state);
    if (cached.data || cached.status === 'pending') return;
    dispatch(tripApi.util.upsertQueryEntries([{ endpointName: 'getTripById', arg: trip.id, value: trip }]));
  };
