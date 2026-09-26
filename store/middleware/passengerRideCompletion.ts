import { isAction, type Middleware, type ThunkDispatch, type UnknownAction } from '@reduxjs/toolkit';
import { hasPassengerFinishedRide } from '@/features/activity/tripParticipation';
import type { Booking } from '@/types';
import { bookingApi } from '../api/bookingApi';

type CompletionState = { auth: { user: { id: string } | null } }
  & { [bookingApi.reducerPath]: ReturnType<typeof bookingApi.reducer> };

const listEndpoints = new Set(['getMyActivityBookings', 'getMyBookings']);
const detailEndpoints = new Set([
  'getBookingById', 'confirmDropoffByPassenger', 'confirmDropoff', 'confirmPassengerTripInterruption',
]);

/** Forward only acknowledged transport completion, never infer payment or end the whole trip. */
function mergeCompletion(current: Booking, source: Booking, userId: string) {
  if (current.id !== source.id || current.tripId !== source.tripId ||
    current.passengerId !== userId || source.passengerId !== userId) return;
  if (current.status !== 'accepted' && current.status !== 'completed') return;
  if (source.status === 'completed') current.status = 'completed';
  if (source.droppedOff) current.droppedOff = true;
  if (source.droppedOffConfirmedByPassenger) current.droppedOffConfirmedByPassenger = true;
  if (source.droppedOffAt && !current.droppedOffAt) current.droppedOffAt = source.droppedOffAt;
  if (source.droppedOffConfirmedAt && !current.droppedOffConfirmedAt) {
    current.droppedOffConfirmedAt = source.droppedOffConfirmedAt;
  }
}

/** Detail polling / successful confirmation can finish before the activity list refresh.
 * Keep those views consistent without another request, timer, or optimistic completion.
 */
export function createPassengerRideCompletionMiddleware(): Middleware<
  object, CompletionState, ThunkDispatch<CompletionState, unknown, UnknownAction>
> {
  return store => next => action => {
    if (!isAction(action) || (action.type !== `${bookingApi.reducerPath}/executeQuery/fulfilled`
      && action.type !== `${bookingApi.reducerPath}/executeMutation/fulfilled`)) return next(action);
    const response = action as typeof action & {
      payload: Booking | Booking[];
      meta?: { arg?: { endpointName?: string } };
    };
    const name = response.meta?.arg?.endpointName ?? '';
    if (!listEndpoints.has(name) && !detailEndpoints.has(name)) return next(action);

    const before = store.getState();
    const userId = before.auth.user?.id;
    if (!userId) return next(action);
    const completed = new Map<string, Booking>();
    const remember = (booking?: Booking) => {
      if (booking?.passengerId !== userId || !hasPassengerFinishedRide(booking)) return;
      const previous = completed.get(booking.id);
      if (previous) mergeCompletion(previous, booking, userId);
      else completed.set(booking.id, { ...booking });
    };
    // Retain confirmed progress if an older in-flight list/detail response arrives late.
    bookingApi.endpoints.getMyActivityBookings.select()(before).data?.forEach(remember);
    bookingApi.endpoints.getMyBookings.select()(before).data?.forEach(remember);
    const cachedDetailIds = bookingApi.util.selectCachedArgsForQuery(before, 'getBookingById');
    for (const id of cachedDetailIds) {
      remember(bookingApi.endpoints.getBookingById.select(id)(before).data);
    }
    const result = next(action);
    if (store.getState().auth.user?.id !== userId) return result;
    if (Array.isArray(response.payload)) response.payload.forEach(remember);
    else remember(response.payload);
    if (!completed.size) return result;

    const merge = (current: Booking) => {
      const source = completed.get(current.id);
      if (source) mergeCompletion(current, source, userId);
    };
    const patchList = (name: 'getMyActivityBookings' | 'getMyBookings') => {
      store.dispatch(bookingApi.util.updateQueryData(name, undefined, bookings => bookings.forEach(merge)));
    };
    patchList('getMyActivityBookings');
    patchList('getMyBookings');
    for (const id of cachedDetailIds) {
      if (completed.has(id)) store.dispatch(bookingApi.util.updateQueryData('getBookingById', id, merge));
    }
    return result;
  };
}
