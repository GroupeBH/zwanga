import type { Trip } from '@/types';

/** A completed ride is not necessarily an expired, never-started departure. */
export function isTripExpired(trip: Trip | undefined, now = Date.now()): boolean {
  if (!trip || trip.status === 'ongoing' || trip.status === 'cancelled') return false;
  if (trip.isExpired === true || trip.canReprogram === true) return true;
  return trip.status === 'upcoming' && !trip.startedAt && Date.parse(trip.departureTime) < now;
}

export type TripDetailFeedback = { title: string; message: string; retry: boolean };

export function resolveTripDetailAvailability({ trip, userId, error, loading }: {
  trip: Trip | undefined; userId?: string; error?: unknown; loading: boolean;
}): { trip?: Trip; expired: boolean; loading: boolean; feedback: TripDetailFeedback | null } {
  const failure = error as { status?: number | string; data?: { code?: string } } | undefined;
  const status = Number(failure?.status);
  const expired = isTripExpired(trip);
  const result = (feedback: TripDetailFeedback, isExpired = false) =>
    ({ trip: undefined, expired: isExpired, loading: false, feedback });
  // A definitive server refusal must not be bypassed by an old list/detail cache.
  if (status === 401 || status === 403) return result({
    title: status === 401 ? 'Connexion nécessaire' : 'Trajet privé',
    message: status === 401 ? 'Reconnectez-vous pour consulter ce trajet.' : 'Vous ne pouvez pas consulter ce trajet.',
    retry: false,
  });
  if (status === 410 || failure?.data?.code === 'TRIP_EXPIRED') return result({
    title: 'Ce trajet a expiré', message: 'Le départ prévu est passé. Vous pouvez chercher un autre trajet.', retry: false,
  }, true);
  if (status === 404) return result({
    title: 'Trajet introuvable', message: 'Ce trajet n’existe plus ou a été supprimé.', retry: false,
  });
  if (trip) {
    if (expired && trip.driverId !== userId) return result({
      title: 'Ce trajet a expiré', message: 'Le départ prévu est passé. Vous pouvez chercher un autre trajet.', retry: false,
    }, true);
    return { trip, expired, loading: false, feedback: null };
  }
  if (loading) return { trip: undefined, expired: false, loading: true, feedback: null };
  return result({
    title: 'Trajet temporairement indisponible',
    message: 'Impossible de charger le trajet. Vérifiez votre connexion et réessayez.', retry: true,
  });
}
