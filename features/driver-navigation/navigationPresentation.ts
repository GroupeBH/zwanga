import type { Booking } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { type ImageRequireSource } from 'react-native';

export { PICKUP_NOTICE_PRIORITY } from './pickupNoticePriority';
export const androidNavigationMarkerImages: Record<'departure' | 'pickup' | 'dropoff' | 'destination', ImageRequireSource> = {
  departure: require('@/assets/images/map-markers/trip-detail-marker-departure.png'),
  pickup: require('@/assets/images/map-markers/trip-detail-marker-passenger.png'),
  dropoff: require('@/assets/images/map-markers/trip-detail-marker-arrival.png'),
  destination: require('@/assets/images/map-markers/trip-detail-marker-arrival.png'),
};

export const cleanHtmlInstructions = (html: string): string => {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

export const formatDistanceForSpeech = (distanceInMeters: number): string => {
  if (!Number.isFinite(distanceInMeters) || distanceInMeters <= 0) {
    return '';
  }

  if (distanceInMeters >= 1000) {
    const kilometers = distanceInMeters / 1000;
    const rounded = kilometers >= 10 ? Math.round(kilometers).toString() : kilometers.toFixed(1).replace('.', ',');
    return `${rounded} ${kilometers > 1 ? 'kilomètres' : 'kilomètre'}`;
  }

  const roundedMeters = Math.max(10, Math.round(distanceInMeters / 10) * 10);
  return `${roundedMeters} mètres`;
};

export const formatSeatCount = (seats: number): string => {
  const safeSeats = Number.isFinite(seats) && seats > 0 ? Math.round(seats) : 1;
  return `${safeSeats} place${safeSeats > 1 ? 's' : ''}`;
};

export const formatNavigationDistance = (distanceInMeters: number | null | undefined) => {
  if (typeof distanceInMeters !== 'number' || !Number.isFinite(distanceInMeters)) {
    return null;
  }

  if (distanceInMeters >= 1000) {
    return `${(distanceInMeters / 1000).toFixed(1)} km`;
  }

  return `${Math.max(1, Math.round(distanceInMeters))} m`;
};

export const formatNavigationDuration = (durationInSeconds: number | null | undefined) => {
  if (typeof durationInSeconds !== 'number' || !Number.isFinite(durationInSeconds)) {
    return null;
  }

  const minutes = Math.max(1, Math.round(durationInSeconds / 60));
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
  }

  return `${minutes} min`;
};

export const formatNavigationEta = (durationInSeconds: number | null | undefined) => {
  if (typeof durationInSeconds !== 'number' || !Number.isFinite(durationInSeconds)) {
    return null;
  }

  return new Date(Date.now() + durationInSeconds * 1000).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatTripRevenueAmount = (amount: number, currency: string) =>
  `${Number(amount || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${currency}`;

export const formatPendingBookingPayment = (booking: Booking, tripPrice?: number): string => {
  if (booking.paymentMode === 'cash') {
    return 'Cash';
  }

  if (booking.paymentMode === 'points') {
    return 'Jetons';
  }

  if (booking.paymentMode === 'electronic') {
    return 'Mobile money';
  }

  if (!tripPrice || tripPrice <= 0) {
    return 'Gratuit';
  }

  return `${tripPrice * booking.numberOfSeats} FC`;
};

export const getBookingActionErrorMessage = (error: any, fallback: string): string => {
  return getApiErrorMessage(error, fallback);
};
