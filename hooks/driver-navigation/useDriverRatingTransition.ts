import { useCallback } from 'react';
import type { useDriverNavigationFoundation } from './useDriverNavigationFoundation';

/** Close ride panels and stop native work before replacing navigation by rating. */
export function useDriverRatingTransition(foundation: ReturnType<typeof useDriverNavigationFoundation>) {
  const { data: { tripId, router, isScreenActive }, refs: { isExitingRef },
    mapState: { navigateAfterRelease }, exitActions: { cleanupNavigationUi } } = foundation;
  return useCallback((passengerId?: string) => {
    if (!tripId || !isScreenActive || isExitingRef.current) return;
    isExitingRef.current = true;
    cleanupNavigationUi();
    const scheduled = navigateAfterRelease(() => router.replace(passengerId
      ? { pathname: '/rate/[id]', params: { id: tripId, passengerId } } : `/rate/${tripId}`),
      () => { isExitingRef.current = false; });
    if (!scheduled) isExitingRef.current = false;
  }, [cleanupNavigationUi, isExitingRef, isScreenActive, navigateAfterRelease, router, tripId]);
}
