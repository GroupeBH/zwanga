import { useCallback, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { showRideActionResult } from '@/store/slices/rideRecoverySlice';
import { rideSaveError, type RideActionTarget } from '@/features/ride-recovery/rideActionResultModel';
import type { RideOutboxEntry } from '@/features/ride-recovery/rideRecoveryModel';

/** Call after the source action's existing focus/mount guard; late account responses are ignored. */
export function useRideActionFeedback() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(state => state.auth.user?.id);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const saved = useCallback((target: RideActionTarget, entry: RideOutboxEntry) => {
    if (!userId || currentUser.current !== userId || entry.actorUserId !== userId || entry.bookingId !== target.bookingId ||
      entry.tripId !== target.tripId || entry.stage !== target.stage) return;
    dispatch(showRideActionResult({ ...target, userId,
      receipt: { eventId: entry.eventId, state: entry.state, decision: entry.decision, message: entry.message } }));
  }, [dispatch, userId]);
  const failed = useCallback((target: RideActionTarget, error: unknown) => {
    if (!userId || currentUser.current !== userId) return;
    dispatch(showRideActionResult({ ...target, userId, error: rideSaveError(error) }));
  }, [dispatch, userId]);
  return { saved, failed };
}
