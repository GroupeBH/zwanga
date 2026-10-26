import { useEffect } from 'react';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppDispatch } from '@/store/hooks';
import { baseApi } from '@/store/api/baseApi';
import { chatSocket } from '@/services/chatSocket';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { displayDriverInvitation, dismissDriverInvitation } from '@/services/driverNotifications';
import { pendingRideAlertHandoffs, pendingRideAlerts } from '@/services/rideAlertSession';
import { canShowRequestNotification } from '@/features/notifications/requestVisibility';
import { reportRideAudioFailure } from '@/services/rideAudioDiagnostics';
import { rideRealtimeTags } from '@/features/notifications/rideRealtimeRefresh';
import type { RideRealtimeEvent } from '@/features/notifications/rideRealtime';

/** One shared socket, foreground only; no background polling or offline decisions. */
export function useRideRealtime(userId: string | undefined, driverAccount: boolean) {
  const active = useAppIsActive();
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!active || !userId) return;
    const session = getTokenSessionVersion();
    let disposed = false;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    const seen = new Map<string, number>();
    const tags = new Map<string, ReturnType<typeof rideRealtimeTags>[number]>();
    const current = () => !disposed && session === getTokenSessionVersion();
    const invalidate = (event: RideRealtimeEvent) => {
      for (const tag of rideRealtimeTags(event)) tags.set(`${tag.type}:${tag.id ?? '*'}`, tag);
      // Socket reconnect bursts share one bounded REST/cache refresh.
      if (refresh) return;
      refresh = setTimeout(() => {
        refresh = undefined;
        if (current()) dispatch(baseApi.util.invalidateTags([...tags.values()]));
        tags.clear();
      }, 1000);
    };
    const stop = chatSocket.subscribeToRideAlerts(event => {
      if (!current() || (event.kind !== 'reconnected' && event.recipientId !== userId)) return;
      if (event.kind === 'incoming') {
        if (!canShowRequestNotification(event.data, { id: userId, role: driverAccount ? 'driver' : 'passenger' })) return;
        const now = Date.now();
        for (const [id, until] of seen) if (until <= now) seen.delete(id);
        if (seen.has(event.eventId)) return;
        seen.set(event.eventId, now + 60_000);
        while (seen.size > 256) seen.delete(seen.keys().next().value!);
        // Uses the exact push path and its existing delivery/acknowledgement keys.
        void displayDriverInvitation(event.data).catch(() => reportRideAudioFailure('DRIVER_ALERT_DISPLAY_FAILED'));
      } else if (event.kind === 'changed' && event.terminal) {
        const candidates = new Map([...pendingRideAlerts(userId),
          ...pendingRideAlertHandoffs(userId).map(item => item.alert)].map(alert => [alert.key, alert]));
        const matches = [...candidates.values()].filter(alert => alert.kind !== 'response' &&
          ((event.bookingId && alert.kind === 'booking' && alert.id === event.bookingId) ||
           (event.requestId && (alert.data.tripRequestId === event.requestId || (alert.kind === 'nearby' && alert.id === event.requestId)))));
        for (const alert of matches) if (alert.kind !== 'response')
          void dismissDriverInvitation({ kind: alert.kind, id: alert.id, driverId: userId,
            ringUntil: String(alert.data.ringUntil ?? new Date().toISOString()) }).catch(() => reportRideAudioFailure('DRIVER_ALERT_DISMISS_FAILED'));
      }
      invalidate(event);
    });
    return () => { disposed = true; if (refresh) clearTimeout(refresh); stop(); };
  }, [active, dispatch, driverAccount, userId]);
}
