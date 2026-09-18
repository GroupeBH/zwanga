import { EMPTY_HIDDEN_HOME_PRIORITIES } from '@/features/home/homePriorityDismissal';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { dismissHomePriority } from '@/store/slices/homePriorityDismissalsSlice';
import { useCallback } from 'react';

export function useHomePriorityDismissals(userId?: string) {
  const dispatch = useAppDispatch();
  const hiddenHomePriorities = useAppSelector(state =>
    userId && state.homePriorityDismissals.userId === userId
      ? state.homePriorityDismissals.keys : EMPTY_HIDDEN_HOME_PRIORITIES,
  );
  const dismissPriority = useCallback((key: string) => {
    if (userId) dispatch(dismissHomePriority({ userId, key }));
  }, [dispatch, userId]);
  return { hiddenHomePriorities, dismissPriority };
}
