import { notificationApi } from '../notificationApi';
import type { AppDispatch } from '@/store';

/** No optimistic acknowledgement: keep existing rows on a refused/ambiguous mutation. */
export async function applyConfirmedNotificationChange(
  dispatch: AppDispatch, queryFulfilled: Promise<unknown>,
  change: { ids?: string[]; read?: boolean; remove?: boolean },
) {
  try {
    await queryFulfilled;
    const ids = change.ids ? new Set(change.ids) : null;
    dispatch(notificationApi.util.updateQueryData('getNotificationPages', undefined, draft => {
      for (const page of draft.pages) {
        if (change.remove) page.notifications = page.notifications.filter(row => !ids?.has(row.id));
        else for (const row of page.notifications) {
          if ((!ids || ids.has(row.id)) && change.read !== undefined) row.isRead = change.read;
        }
      }
      // Counts/offsets are server-owned and reconciled by the bounded invalidation read.
    }));
  } catch { /* The mutation caller owns the error UI; do not acknowledge failure locally. */ }
}
