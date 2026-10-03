import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { dismissRideActionResult } from '@/store/slices/rideRecoverySlice';
import React, { memo, useCallback, useEffect, useMemo } from 'react';
import { rideRecoveryApi } from '@/store/api/rideRecoveryApi';
import { RideActionResultModal } from './RideActionResultModal';

/** Lives in the navigation route, not in a button that disappears after dropoff. */
export const RideActionResult = memo(function RideActionResult({ tripId, bookingId, actor, active }: {
  tripId: string; bookingId?: string; actor: 'driver' | 'passenger'; active: boolean;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(state => state.auth.user?.id);
  const result = useAppSelector(state => state.rideRecovery.actionResult);
  const selectSnapshot = useMemo(() => rideRecoveryApi.endpoints.getRideDeclarations.select(
    actor === 'passenger' ? { bookingId } : { tripId }), [actor, bookingId, tripId]);
  const snapshot = useAppSelector(state => active && result?.userId === userId
    ? selectSnapshot(state).data?.find(item => item.bookingId === result?.bookingId) : undefined);
  const entry = useAppSelector(state => state.rideRecovery.userId === userId && result?.userId === userId
    ? state.rideRecovery.entries.find(item => item.eventId === result?.receipt?.eventId) : undefined);
  const belongs = Boolean(result && result.actor === actor && result.tripId === tripId &&
    (actor === 'driver' || result.bookingId === bookingId));
  const resultId = belongs ? result?.id : undefined;
  const owner = result?.userId;
  const visible = Boolean(active && belongs && owner === userId && result);
  const close = useCallback(() => { if (resultId) dispatch(dismissRideActionResult(resultId)); }, [dispatch, resultId]);
  useEffect(() => {
    if (!visible) return; // An inactive duplicate route must not dismiss another screen's result.
    return close; // A dismissed/blurred result never reopens on a later server update.
  }, [visible, close]);
  if (!visible || !result) return null;
  return <RideActionResultModal key={result.id} result={result} entry={entry} snapshot={snapshot} onClose={close} />;
});
