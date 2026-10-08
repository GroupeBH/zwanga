import { useCallback } from 'react';
import type { useDriverNavigationFoundation } from './useDriverNavigationFoundation';

/** Close ride panels and stop native work before replacing navigation by rating. */
export function useDriverRatingTransition(foundation: ReturnType<typeof useDriverNavigationFoundation>) {
  const { data: { tripId, router, isScreenActive }, refs: { isExitingRef },
    mapState: { navigateAfterRelease }, exitActions: { cleanupNavigationUi } } = foundation;
  return useCallback(() => {
    if (!tripId || !isScreenActive || isExitingRef.current) return;
    isExitingRef.current = true;
    cleanupNavigationUi();
    const scheduled = navigateAfterRelease(() => router.replace(`/rate/${tripId}`),
      () => { isExitingRef.current = false; });
    if (!scheduled) isExitingRef.current = false;
  }, [cleanupNavigationUi, isExitingRef, isScreenActive, navigateAfterRelease, router, tripId]);
}
