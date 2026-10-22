import { useEffect } from 'react';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppDispatch } from '@/store/hooks';
import { baseApi } from '@/store/api/baseApi';
import { chatSocket } from '@/services/chatSocket';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { displayDriverInvitation, dismissDriverInvitation } from '@/services/driverNotifications';
import { pendingRideAlerts } from '@/services/rideAlertSession';
import { canShowRequestNotification } from '@/features/notifications/requestVisibility';
import { reportRideAudioFailure } from '@/services/rideAudioDiagnostics';

/** One shared socket, foreground only; no background polling or offline decisions. */
export function useRideRealtime(userId: string | undefined, driverAccount: boolean) {
  const active = useAppIsActive();
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!active || !userId) return;
    const session = getTokenSessionVersion();
    let disposed = false;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    const current = () => !disposed && session === getTokenSessionVersion();
    const invalidate = () => {
      // Socket reconnect bursts share one bounded REST/cache refresh.
      if (refresh) return;
      refresh = setTimeout(() => {
        refresh = undefined;
        if (current()) dispatch(baseApi.util.invalidateTags(['DriverDispatch', 'AccountActivity', 'TripRequest', 'Booking']));
      }, 200);
    };
    const stop = chatSocket.subscribeToRideAlerts(event => {
      if (!current() || (event.kind !== 'reconnected' && event.recipientId !== userId)) return;
      if (event.kind === 'incoming') {
        if (!canShowRequestNotification(event.data, { id: userId, role: driverAccount ? 'driver' : 'passenger' })) return;
        // Uses the exact push path and its existing delivery/acknowledgement keys.
        void displayDriverInvitation(event.data).catch(() => reportRideAudioFailure('DRIVER_ALERT_DISPLAY_FAILED'));
      } else if (event.kind === 'changed' && event.terminal) {
        const matches = pendingRideAlerts(userId).filter(alert => alert.kind !== 'response' &&
          ((event.bookingId && alert.kind === 'booking' && alert.id === event.bookingId) ||
           (event.requestId && (alert.data.tripRequestId === event.requestId || (alert.kind === 'nearby' && alert.id === event.requestId)))));
        for (const alert of matches) if (alert.kind !== 'response')
          void dismissDriverInvitation({ kind: alert.kind, id: alert.id, driverId: userId,
            ringUntil: String(alert.data.ringUntil ?? new Date().toISOString()) }).catch(() => reportRideAudioFailure('DRIVER_ALERT_DISMISS_FAILED'));
      }
      invalidate();
    });
    return () => { disposed = true; if (refresh) clearTimeout(refresh); stop(); };
  }, [active, dispatch, driverAccount, userId]);
}
