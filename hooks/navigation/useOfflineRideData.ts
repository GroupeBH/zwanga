import { useEffect, useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { loadRideSnapshot, removeRideSnapshot, saveRideSnapshot } from '@/features/ride-recovery/offlineRideSnapshots';

/** Disk fallback is never injected into RTK Query as a fresh server response. */
export function useOfflineRideData<T>(scope: string, live: T | undefined, error: unknown, persist: boolean) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const key = `${userId ?? ''}:${scope}`;
  const [saved, setSaved] = useState<{ key: string; data?: T }>({ key: '' });
  const status = (error as { status?: number | string } | undefined)?.status;
  const unavailable = [401, 403, 404, 410].includes(Number(status));
  useEffect(() => {
    if (unavailable) {
      setSaved({ key });
      if (userId) void removeRideSnapshot(userId, scope).catch(() => undefined);
      return;
    }
    let disposed = false;
    if (userId) void loadRideSnapshot<T>(userId, scope).then(data => {
      if (!disposed) setSaved({ key, data });
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [key, scope, userId, unavailable]);
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
  const transient = status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR' || (typeof status === 'number' && status >= 500);
  const fallback = !live && transient && saved.key === key ? saved.data : undefined;
  return { data: unavailable ? undefined : live ?? fallback, offline: Boolean(transient && (live || fallback)) };
}
