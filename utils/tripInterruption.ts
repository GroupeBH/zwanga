import type { TripInterruptionReason, TripInterruptionStatus } from '@/types';

export const TRIP_INTERRUPTION_REASON_LABELS: Record<TripInterruptionReason, string> = {
  emergency: 'Urgence',
  health: 'Sante',
  safety: 'Securite',
  route_issue: 'Probleme sur la route',
  personal: 'Raison personnelle',
  other: 'Autre raison',
};

export const TRIP_INTERRUPTION_STATUS_LABELS: Record<TripInterruptionStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmee',
  rejected: 'Refusee',
  cancelled: 'Annulee',
  completed: 'Terminee',
};

export function getTripInterruptionReasonLabel(reason?: string | null) {
  const normalizedReason = (reason ?? 'other').toLowerCase() as TripInterruptionReason;
  return TRIP_INTERRUPTION_REASON_LABELS[normalizedReason] ?? TRIP_INTERRUPTION_REASON_LABELS.other;
}

export function getTripInterruptionStatusLabel(status?: string | null) {
  const normalizedStatus = (status ?? 'pending').toLowerCase() as TripInterruptionStatus;
  return TRIP_INTERRUPTION_STATUS_LABELS[normalizedStatus] ?? TRIP_INTERRUPTION_STATUS_LABELS.pending;
}

export function isPendingTripInterruption(status?: string | null) {
  return (status ?? '').toLowerCase() === 'pending';
}
