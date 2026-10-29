import { baseApi } from './baseApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { driverRecoveryCandidates, driverRecoveryDetailUrl, record, RECOVERY_INBOX_LIMIT,
  validateRecoveredDriverAlert } from '@/features/notifications/driverAlertRecovery';
import type { RideAlert } from '@/features/notifications/rideAlert';

export type DriverAlertRecovery = { alerts: RideAlert[]; retry: boolean };
/** A private, read-only operation. Mutation lifecycle avoids stale query-cache
 * replay and lets cancellation abort ONLY this recovery, never a screen's GET. */
export const driverAlertRecoveryApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    readDriverAlertRecovery: builder.mutation<DriverAlertRecovery, { userId: string; session: number }>({
      async queryFn({ userId, session }, api, _extra, read) {
        const current = () => !api.signal.aborted && session === getTokenSessionVersion() &&
          (api.getState() as { auth?: { user?: { id?: string } } }).auth?.user?.id === userId;
        const cancelled = () => ({ error: { status: 'CUSTOM_ERROR' as const, error: 'RIDE_RECOVERY_CANCELLED' } });
        if (!current()) return cancelled();
        const inbox = await read({ url: '/notifications', params: { limit: RECOVERY_INBOX_LIMIT, offset: 0 }, timeout: 3500 });
        if (!current()) return cancelled();
        if (inbox.error) return { error: inbox.error };
        const rows = record(inbox.data)?.notifications;
        if (!Array.isArray(rows)) return { error: { status: 'CUSTOM_ERROR', error: 'RIDE_RECOVERY_INVALID' } };
        let retry = false;
        const alerts = await Promise.all(driverRecoveryCandidates(rows, userId).map(async alert => {
          const url = driverRecoveryDetailUrl(alert);
          if (!url || !current()) return null;
          const result = await read({ url, timeout: 3500 });
          if (!current()) return null;
          if (result.error) {
            // Resolved/inaccessible offers are terminal, never an offline replay.
            if (![400, 401, 403, 404, 409, 410].includes(Number(result.error.status))) retry = true;
            return null;
          }
          return validateRecoveredDriverAlert(alert, result.data);
        }));
        if (!current()) return cancelled();
        return { data: { alerts: alerts.filter((alert): alert is RideAlert => alert !== null), retry } };
      },
    }),
  }),
});
