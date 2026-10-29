import { isInvitationId } from '@/features/notifications/driverInvitation';
import type { DriverPaymentNotice, SeenDriverPaymentNotices } from './paymentNoticeModel';

/** Only an authenticated REST response can supply receipt amounts. Socket data is a hint. */
export function paymentInbox(response: unknown, userId: string): DriverPaymentNotice[] {
  if (!response || typeof response !== 'object') throw new Error('Invalid payment inbox');
  const body = response as { userId?: unknown; notices?: unknown };
  if (body.userId !== userId || !Array.isArray(body.notices) || body.notices.length > 20) throw new Error('Invalid payment inbox');
  return body.notices.flatMap((data): DriverPaymentNotice[] => {
    if (!data || data.role !== 'driver' || data.driverId !== userId || !isInvitationId(data.notificationId) ||
        !isInvitationId(data.bookingId) || !isInvitationId(data.tripId)) return [];
    const cash = data.type === 'cash_payment_confirmed';
    if (!cash && data.type !== 'driver_booking_payment_confirmed') return [];
    if (!['points', 'electronic', 'cash'].includes(data.paymentMode) || (cash !== (data.paymentMode === 'cash'))) return [];
    const amount = data.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || typeof data.currency !== 'string' || !/^[A-Z]{3}$/.test(data.currency)) return [];
    const partial = data.partial === true;
    if (partial && (cash || data.paymentMode !== 'points' || typeof data.cashRemainder !== 'number' ||
        !Number.isFinite(data.cashRemainder) || data.cashRemainder < 0)) return [];
    return [{ key: `booking-payment:${data.bookingId}${cash ? ':cash' : partial ? ':tokens' : ''}`,
      notificationId: data.notificationId, bookingId: data.bookingId, tripId: data.tripId,
      passengerName: 'un passager', amount, currency: data.currency, mode: data.paymentMode,
      paidAt: data.createdAt, cashReceived: cash, partial, cashRemainder: partial ? data.cashRemainder : undefined }];
  });
}

export function boundedSeenPaymentNotices(value: unknown): SeenDriverPaymentNotices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, date]) => key.startsWith('booking-payment:') &&
    typeof date === 'string' && Number.isFinite(Date.parse(date)))
    .sort((a, b) => Date.parse(String(b[1])) - Date.parse(String(a[1]))).slice(0, 500)
    .map(([key, date]) => [key, String(date)]));
}
