import { RideOverlayContext } from '@/features/navigation/rideOverlayContext';
import type { DialogOptions } from '@/features/dialogs/dialogTypes';
import { useCallback, useContext, useRef } from 'react';

export function useRideNotice(scope: string, active: boolean) {
  const store = useContext(RideOverlayContext);
  const current = useRef({ scope, active });
  current.current = { scope, active };
  return useCallback((notice: DialogOptions) => {
    if (!current.current.active) return;
    store?.showNotice(current.current.scope, { title: notice.title, message: notice.message, expiresAt: Date.now() + 10_000 });
  }, [store]);
}
