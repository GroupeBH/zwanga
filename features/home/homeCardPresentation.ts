import { formatPrice } from '@/features/home/homeModel';
import { formatDateWithRelativeLabel, formatTime } from '@/utils/dateHelpers';

export function homeDepartureLabel(iso?: string | null) {
  return iso && Number.isFinite(new Date(iso).getTime())
    ? formatDateWithRelativeLabel(iso, true) : 'Horaire à préciser';
}

/** A request window is about departure, never an estimated arrival. */
export function homeRequestDepartureLabel(min: string, max?: string | null) {
  const start = new Date(min), end = max ? new Date(max) : null;
  const label = homeDepartureLabel(min);
  if (!Number.isFinite(start.getTime()) || !end || !Number.isFinite(end.getTime()) || end <= start) return label;
  return start.toDateString() === end.toDateString()
    ? `${label}–${formatTime(max!)}` : `${label} → ${homeDepartureLabel(max)}`;
}

export function homePriceLabel(price?: number | null) {
  return price !== null && price !== undefined && Number.isFinite(price) && price >= 0
    ? formatPrice(price) : 'Prix à préciser';
}

export function homeSeatsLabel(count: number, available = false) {
  if (!Number.isFinite(count) || count < 0) return 'Places à préciser';
  if (available && count === 0) return 'Complet';
  return `${count} place${count > 1 ? 's' : ''}${available ? ` libre${count > 1 ? 's' : ''}` : ''}`;
}

export function homeDistanceLabel(meters: number | null) {
  if (meters === null || !Number.isFinite(meters) || meters < 0) return null;
  if (meters < 100) return '< 100 m';
  return meters < 1000 ? `${Math.round(meters / 100) * 100} m`
    : `${(Math.round(meters / 100) / 10).toString().replace('.', ',')} km`;
}
