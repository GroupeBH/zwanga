export type RideStage = 'pickup' | 'dropoff';
export type RideDecision = 'confirm' | 'reject';
export type RideStageStatus = 'none' | 'awaiting_other' | 'ready' | 'confirmed' | 'disputed';
export interface RideSnapshot {
  bookingId: string;
  tripId: string;
  actor: 'driver' | 'passenger';
  pickup: { status: RideStageStatus; driver?: RideDecision; passenger?: RideDecision };
  dropoff: { status: RideStageStatus; driver?: RideDecision; passenger?: RideDecision };
}
export interface RideDeclaration {
  actorUserId: string;
  eventId: string;
  bookingId: string;
  tripId: string;
  stage: RideStage;
  decision: RideDecision;
  occurredAt: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
}
export interface RideOutboxEntry extends RideDeclaration {
  state: 'queued' | 'sending' | 'received' | 'confirmed' | 'disputed' | 'blocked';
  attempts: number;
  nextAttemptAt: number;
  message?: string;
}
export const MAX_RIDE_EVENTS = 100;
export const OFFLINE_RIDE_MAX_AGE = 72 * 60 * 60_000;

export function rideRetry(error: unknown, attempts: number, now: number) {
  const { status, data } = (error ?? {}) as { status?: string | number; data?: { code?: string } };
  if (data?.code === 'RIDE_PICKUP_REQUIRED') return { state: 'queued' as const, nextAttemptAt: now + 30_000, message: 'En attente de la confirmation de l’embarquement.' };
  if (status === 401) return { state: 'queued' as const, nextAttemptAt: now + 60_000, message: 'Reconnectez-vous à votre compte pour transmettre votre confirmation.' };
  if (data?.code === 'RIDE_ACCOUNT_CHANGED') return { state: 'queued' as const, nextAttemptAt: now + 60_000, message: 'Reconnectez-vous au compte utilisé pour cette confirmation.' };
  const preciseMessages: Record<string, string> = {
    RIDE_EVENT_TIME: 'La date de cette confirmation ne peut pas être validée. Vérifiez l’heure du téléphone puis contactez l’assistance.',
    RIDE_STATE_CHANGED: 'Le trajet a changé depuis votre action. Actualisez son détail ou contactez l’assistance.',
    RIDE_ALREADY_CONFIRMED: 'Cette étape est déjà validée. Contactez l’assistance pour signaler votre désaccord.',
    RIDE_DECISION_LOCKED: 'Une réponse différente est déjà enregistrée. Contactez l’assistance pour la corriger.',
  };
  if (typeof status === 'number' && status >= 400 && status < 500 && ![408, 429].includes(status)) {
    return { state: 'blocked' as const, nextAttemptAt: 0, message: preciseMessages[data?.code ?? ''] ?? (status === 404
      ? 'La confirmation de cette étape n’est pas disponible pour ce trajet. Actualisez son détail ou contactez l’assistance.'
      : 'Cette action ne peut plus être validée automatiquement. Actualisez le trajet ou contactez l’assistance.') };
  }
  return { state: 'queued' as const, nextAttemptAt: now + Math.min(120_000, Math.round(3_000 * 2 ** Math.min(attempts, 6) * (1 + Math.random() * 0.2))), message: 'Enregistré sur ce téléphone. Envoi dès que la connexion le permet.' };
}

export function rideEntryMessage(entry?: RideOutboxEntry, status?: RideStageStatus) {
  if (entry?.state === 'blocked' && entry.decision === 'reject') return entry.message ?? 'Contactez l’assistance pour signaler votre désaccord.';
  if (status === 'confirmed' || entry?.state === 'confirmed') return 'Confirmation validée.';
  if (status === 'disputed' || entry?.state === 'disputed') return 'Les réponses ne concordent pas. Contactez l’assistance pour résoudre le désaccord.';
  if (entry?.state === 'sending') return 'Confirmation enregistrée sur ce téléphone. Envoi en cours…';
  if (entry?.state === 'blocked') return entry.message ?? 'Actualisez le trajet ou contactez l’assistance.';
  if (entry?.state === 'queued') return entry.message ?? 'Enregistré sur ce téléphone. En attente de connexion.';
  if (entry?.state === 'received' || status === 'awaiting_other') return 'Reçu par le serveur. En attente de l’autre personne.';
  return 'L’automatisme reste actif. Confirmez seulement ce qui s’est réellement passé.';
}

/** A fresh local GPS fix may suggest the fallback, never confirm for someone. */
export function isNearRideStop(
  point: { latitude: number; longitude: number; recordedAt: number; accuracy?: number } | null,
  target?: { latitude: number; longitude: number } | null,
  now = Date.now(),
) {
  if (!point || !target || !Number.isFinite(point.recordedAt) || now - point.recordedAt > 30_000 || now < point.recordedAt ||
      !Number.isFinite(point.accuracy) || (point.accuracy ?? Infinity) > 100 || (point.accuracy ?? -1) < 0) return false;
  const rad = Math.PI / 180;
  const a = Math.sin((point.latitude - target.latitude) * rad / 2) ** 2 +
    Math.cos(point.latitude * rad) * Math.cos(target.latitude * rad) * Math.sin((point.longitude - target.longitude) * rad / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) <= 200;
}
