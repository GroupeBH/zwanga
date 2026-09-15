import { useEffect, useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { loadRideSnapshot, removeRideSnapshot, saveRideSnapshot } from '@/features/ride-recovery/offlineRideSnapshots';

/** Disk fallback is never injected into RTK Query as a fresh server response. */
export function useOfflineRideData<T>(scope: string, live: T | undefined, error: unknown, persist: boolean) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const key = `${userId ?? ''}:${scope}`;
  const [saved, setSaved] = useState<{ key: string; data?: T }>({ key: '' });
  useEffect(() => {
    let disposed = false;
    if (userId) void loadRideSnapshot<T>(userId, scope).then(data => {
      if (!disposed) setSaved({ key, data });
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [key, scope, userId]);
  useEffect(() => {
    if (!userId || !live || error) return;
    if (!persist) {
      setSaved({ key });
      void removeRideSnapshot(userId, scope).catch(() => undefined);
      return;
    }
    const timer = setTimeout(() => { void saveRideSnapshot(userId, scope, live).catch(() => undefined); }, 500);
    return () => clearTimeout(timer);
  }, [userId, scope, key, live, error, persist]);
  const status = (error as { status?: number | string } | undefined)?.status;
  const transient = status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR' || (typeof status === 'number' && status >= 500);
  const fallback = !live && transient && saved.key === key ? saved.data : undefined;
  return { data: [401, 403, 404].includes(Number(status)) ? undefined : live ?? fallback, offline: Boolean(transient && (live || fallback)) };
}
