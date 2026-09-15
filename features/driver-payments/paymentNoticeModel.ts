import { selectUser } from '@/store/selectors';
import type { Booking, Trip, TripPaymentMode } from '@/types';

export const DRIVER_PAYMENT_NOTICE_REFRESH_MS = 60_000;
export const DRIVER_PAYMENT_NOTICE_WINDOW_MS = 36 * 60 * 60 * 1_000;
export const DRIVER_PAYMENT_NOTICE_STORAGE_PREFIX = 'zwanga:driver-payment-notices:';
export const DRIVER_PAYMENT_NOTICE_MAX_TRIPS = 4;

export type SeenDriverPaymentNotices = Record<string, string>;

export type DriverPaymentNotice = {
  key: string;
  bookingId: string;
  tripId: string;
  passengerName: string;
  amount: number;
  currency: string;
  mode: TripPaymentMode;
  paidAt?: string | null;
};

export function getStorageKey(userId: string) {
  return `${DRIVER_PAYMENT_NOTICE_STORAGE_PREFIX}${userId}`;
}

export function normalizeAmount(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function formatMoney(value: number, currency?: string | null) {
  const normalizedCurrency = currency?.trim().toUpperCase() || 'CDF';
  const suffix = normalizedCurrency === 'CDF' ? 'FC' : normalizedCurrency;
  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 2,
  }).format(value)} ${suffix}`;
}

export function getPaymentModeLabel(mode?: TripPaymentMode | null) {
  if (mode === 'points') return 'Jetons Zwanga';
  if (mode === 'electronic') return 'Paiement électronique';
  return 'Especes';
}

export function hasPassengerArrived(booking: Booking) {
  return Boolean(
    booking.status === 'completed' ||
      booking.droppedOff ||
      booking.droppedOffConfirmedByPassenger ||
      booking.droppedOffAt,
  );
}

export function isBookingPaymentConfirmed(booking: Booking) {
  if (booking.paymentStatus === 'succeeded') return true;
  return booking.paymentMode === 'cash' && booking.paymentStatus === 'not_required' && hasPassengerArrived(booking);
}

export function isDriverUser(user: ReturnType<typeof selectUser>) {
  return Boolean(user?.isDriver || user?.role === 'driver' || user?.role === 'both');
}

export function isTripEligibleForNotice(trip: Trip) {
  if (trip.status === 'ongoing' || trip.status === 'upcoming') return true;

  const timestamp = Date.parse(trip.completedAt ?? trip.departureTime);
  if (!Number.isFinite(timestamp)) return false;

  return Date.now() - timestamp <= DRIVER_PAYMENT_NOTICE_WINDOW_MS;
}

export function buildPaymentNotice(booking: Booking, trip: Trip): DriverPaymentNotice | null {
  if (!isBookingPaymentConfirmed(booking)) return null;

  const amount = normalizeAmount(booking.paymentAmount) ?? trip.price * booking.numberOfSeats;
  return {
    key: `booking-payment:${booking.id}`,
    bookingId: booking.id,
    tripId: booking.tripId,
    passengerName: booking.passengerName?.trim() || 'Passager',
    amount,
    currency: booking.paymentCurrency ?? 'CDF',
    mode: booking.paymentMode ?? 'cash',
    paidAt: booking.paidAt ?? booking.updatedAt,
  };
}
