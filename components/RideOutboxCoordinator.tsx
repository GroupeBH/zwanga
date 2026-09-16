import { useAppIsActive } from '@/hooks/useAppIsActive';
import { rideOutbox } from '@/services/rideOutbox';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { rideOutboxFailed } from '@/store/slices/rideRecoverySlice';
import { useEffect } from 'react';

/** One foreground worker, shared by all screens. No timer or polling per GPS fix. */
export function RideOutboxCoordinator() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(state => state.auth.user?.id);
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const active = useAppIsActive();
  const hydrated = useAppSelector(state => state.rideRecovery.hydrated && state.rideRecovery.userId === userId);
  const pending = useAppSelector(state => state.rideRecovery.entries.some(entry => ['queued', 'sending', 'received'].includes(entry.state)));
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void rideOutbox.hydrate().catch(() => { if (!cancelled) dispatch(rideOutboxFailed()); });
    return () => { cancelled = true; };
  }, [userId, dispatch]);
  useEffect(() => {
    if (!userId || !hydrated || !pending || !active || !online) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (cancelled || !active || !online) return;
      try { await rideOutbox.flush(); } catch { if (!cancelled) dispatch(rideOutboxFailed()); }
      if (!cancelled) timer = setTimeout(tick, 5_000);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [userId, hydrated, pending, active, online, dispatch]);
  return null;
}
