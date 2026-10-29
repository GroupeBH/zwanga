import { useEffect, useRef, useState } from 'react';
import { useGetDriverPaymentNoticesQuery } from '@/store/api/driverPaymentApi';
import { useMarkNotificationsAsReadMutation } from '@/store/api/notificationApi';
import { useRideSocketConnected } from './useRideSocketConnected';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppSelector } from '@/store/hooks';
import type { DriverPaymentNotice, SeenDriverPaymentNotices } from '@/features/driver-payments/paymentNoticeModel';
import { getTokenSessionVersion } from '@/services/tokenSession';

const EMPTY: DriverPaymentNotice[] = [];
export function useDriverPaymentInbox(userId: string | undefined, enabled: boolean, seen: SeenDriverPaymentNotices) {
  const active = useAppIsActive();
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const connected = useRideSocketConnected(enabled && active);
  const [legacyOwner, setLegacyOwner] = useState<string>();
  const legacy = !!userId && legacyOwner === userId;
  const ready = Boolean(userId && enabled && active && online);
  const read = useGetDriverPaymentNoticesQuery(userId ?? '', {
    skip: !ready || legacy, pollingInterval: ready && !legacy ? connected ? 60_000 : 15_000 : 0,
    skipPollingIfUnfocused: true, refetchOnMountOrArgChange: true,
    refetchOnFocus: false, refetchOnReconnect: true,
  });
  useEffect(() => {
    if (!enabled) setLegacyOwner(undefined);
    if (read.error && 'status' in read.error && [404, 405].includes(Number(read.error.status))) setLegacyOwner(userId);
  }, [enabled, read.error, userId]);
  const notices = read.currentData ?? EMPTY;
  const [acknowledge] = useMarkNotificationsAsReadMutation();
  const session = getTokenSessionVersion();
  // Keep the cooldown across foreground/network changes, but never across accounts.
  // A late completion only releases its own attempt, not a newer session's lock.
  const scope = `${userId}:${session}:${enabled}`;
  const gate = useRef({ scope, pending: false, failures: 0, retryAt: 0 });
  if (gate.current.scope !== scope) gate.current = { scope, pending: false, failures: 0, retryAt: 0 };
  const attempt = gate.current;
  useEffect(() => {
    const ids = notices.filter(notice => seen[notice.key]).flatMap(notice => notice.notificationId ? [notice.notificationId] : []);
    if (!ready || attempt.pending || Date.now() < attempt.retryAt || !ids.length) return;
    attempt.pending = true;
    attempt.retryAt = Date.now() + 15_000;
    // Only acknowledge a user's dismissal, never the mere delivery/display.
    // Reuse the next periodic REST snapshot: no independent timer/background retry.
    // Also pace successful-but-stale responses (e.g. a delayed read replica).
    void (async () => {
      try {
        await acknowledge({ notificationIds: ids }).unwrap();
        attempt.failures = 0;
        attempt.retryAt = Date.now() + 15_000;
      } catch {
        attempt.failures = Math.min(attempt.failures + 1, 6);
        attempt.retryAt = Date.now() + Math.min(300_000, 15_000 * 2 ** (attempt.failures - 1));
        console.warn('[DriverPaymentNotice] Receipt acknowledgement deferred.');
      } finally { attempt.pending = false; }
    })();
  }, [acknowledge, attempt, notices, read.fulfilledTimeStamp, ready, seen]);
  return { notices, legacy };
}
