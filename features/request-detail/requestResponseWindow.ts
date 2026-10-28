import type { TripRequest } from '@/types';

export function requestResponseDeadline(window: TripRequest['responseWindow'], readStartedAt?: number): number | null {
  if (!window || !Number.isFinite(readStartedAt)) return null;
  const remaining = Date.parse(window.expiresAt) - Date.parse(window.serverNow);
  if (!Number.isFinite(remaining)) return null;
  // Use a duration from server time, anchored before the fetch, never the phone's clock offset.
  return readStartedAt! + Math.max(0, remaining);
}

export function requestResponseLabel(phase: NonNullable<TripRequest['responseWindow']>['phase'], seconds: number, passenger = false) {
  if (phase === 'accepting') return 'Confirmation du trajet en cours…';
  if (seconds <= 0) return passenger
    ? 'Cette offre a expiré. Recherche d’un autre conducteur…'
    : 'Délai écoulé. Cette proposition n’est plus disponible.';
  if (phase === 'passenger') return passenger
    ? `Choisissez cette offre sous ${seconds} s` : `Le passager a ${seconds} s pour répondre à votre offre`;
  return `Répondez sous ${seconds} s`;
}
