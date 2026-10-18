import type { PaymentHistoryItem } from '@/types';
import type { HistoryBaseQuery } from './financeHistoryPage';

export type BookingPaymentContext = { bookingId: string; tripId?: string | null; reference?: string | null; transactionId?: string | null };
export type PaymentContext = ({ kind: 'booking' } & BookingPaymentContext) | { kind: 'subscription' };

/** Compatibility only during rollout. New backend returns at most one relevant transaction. */
export function selectPaymentContext(items: PaymentHistoryItem[], context: PaymentContext, now = Date.now()) {
  const identifiers = context.kind === 'booking'
    ? [context.bookingId, context.tripId, context.reference, context.transactionId].filter(Boolean) : [];
  let latest: PaymentHistoryItem | undefined;
  for (const item of items) {
    const at = Date.parse(item.createdAt);
    if (!Number.isFinite(at)) continue;
    if (context.kind === 'booking') {
      if (item.purpose !== 'trip_booking' ||
        ![item.relatedEntityId, item.reference, item.orderNumber].some(value => value && identifiers.includes(value))) continue;
    } else {
      const declined = [item.message, item.statusCode].some(value =>
        /annul|cancel|declined|echec|echoue|failed|failure|refuse|rejet|non abouti|not complet|not successful|solde insuffisant|unsuccessful|insufficient/
          .test((value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));
      if (item.purpose !== 'subscription_pro' || !item.orderNumber ||
        !['pending', 'initiated'].includes(item.status) || declined || now - at > 30 * 60 * 1000) continue;
    }
    if (!latest || at > Date.parse(latest.createdAt)) latest = item;
  }
  return latest ? [latest] : [];
}

export async function readPaymentContext(baseQuery: HistoryBaseQuery, context: PaymentContext) {
  const params = Object.fromEntries(Object.entries(context).filter(([, value]) => value != null && value !== ''));
  const result = await baseQuery({ url: '/payments/history/context', params });
  if (!result.error) return { data: result.data as PaymentHistoryItem[] };
  if (result.error.status !== 404 && result.error.status !== 405) return { error: result.error };
  const legacy = await baseQuery('/payments/history');
  if (legacy.error) return { error: legacy.error };
  return { data: selectPaymentContext(legacy.data as PaymentHistoryItem[], context) };
}
