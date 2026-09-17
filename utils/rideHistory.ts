import type { Booking, Trip } from '@/types';

export const isHistoricalTrip = (trip: Trip, now = Date.now()) =>
  trip.status === 'completed' || trip.status === 'cancelled'
  || (trip.status === 'upcoming' && Date.parse(trip.departureTime) < now);
export const isHistoricalBooking = (booking: Booking, now = Date.now()) =>
  ['completed', 'cancelled', 'rejected', 'expired', 'no_show', 'boarding_uncertain'].includes(booking.status)
  || (['pending', 'accepted'].includes(booking.status) && booking.trip?.status !== 'ongoing'
    && Date.parse(booking.trip?.departureTime ?? '') < now);
export const normalizeHistorySearch = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function matchesHistorySearch(trip: Trip | undefined, search: string, destination?: string | null) {
  return normalizeHistorySearch([trip?.departure.name, trip?.departure.address, trip?.arrival.name,
    trip?.arrival.address, destination, trip?.driverName, trip?.vehicle?.brand, trip?.vehicle?.model,
    trip?.vehicleInfo].filter(Boolean).join(' ')).includes(normalizeHistorySearch(search));
}
export function flattenHistoryPages<T extends { id: string }>(pages?: { data: T[] }[]) {
  const seen = new Set<string>();
  return (pages ?? []).flatMap(page => page.data).filter(record => {
    if (seen.has(record.id)) return false;
    seen.add(record.id); return true;
  });
}
