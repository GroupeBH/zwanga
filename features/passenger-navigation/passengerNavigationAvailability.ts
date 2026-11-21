import type { Booking, Trip } from '@/types';
import { isTripExpired } from '@/features/trip-detail/tripDetailAvailability';

export type PassengerNavigationFeedback = {
  title: string; message: string; retry: boolean;
  icon: 'cloud-offline-outline' | 'time-outline' | 'information-circle-outline' | 'lock-closed-outline' | 'flag-outline';
};
type Params = {
  bookingId: string; booking?: Booking; trip?: Trip;
  bookingError?: unknown; tripError?: unknown; loading: boolean; online: boolean;
};
const failure = (error: unknown) => error as { status?: number | string; data?: { code?: string } } | undefined;

/** Missing data is not proof of deletion. Never infer expiry from an ongoing ride's departure time. */
export function passengerNavigationAvailability(p: Params): { loading: boolean; feedback: PassengerNavigationFeedback | null } {
  const unavailable = (title: string, message: string, retry = false,
    icon: PassengerNavigationFeedback['icon'] = 'information-circle-outline') =>
    ({ loading: false, feedback: { title, message, retry, icon } });
  const errors = [failure(p.bookingError), failure(p.tripError)];
  if (errors.some(e => Number(e?.status) === 401)) return unavailable('Connexion nécessaire',
    'Reconnectez-vous pour retrouver votre trajet.', false, 'lock-closed-outline');
  if (errors.some(e => Number(e?.status) === 403)) return unavailable('Trajet non accessible',
    'Ce compte ne peut pas consulter ce trajet.', false, 'lock-closed-outline');
  if (!p.bookingId) return unavailable('Lien incomplet', 'Ouvrez ce trajet depuis vos réservations.');
  if (errors.some(e => e?.data?.code === 'TRIP_EXPIRED')) return unavailable('Trajet expiré',
    'Le départ prévu est passé sans démarrage. Vous pouvez choisir un autre trajet.', false, 'time-outline');
  if (errors.some(e => Number(e?.status) === 404 || Number(e?.status) === 410)) return unavailable('Trajet indisponible',
    'Ce lien ne permet plus d’accéder au trajet. Il a pu être retiré ou supprimé.');
  if (p.trip?.status === 'cancelled') return unavailable('Trajet annulé',
    'Ce trajet a été annulé. Vous pouvez choisir un autre trajet.');
  if (p.booking?.status === 'cancelled' || p.booking?.status === 'rejected') return unavailable(
    p.booking.status === 'rejected' ? 'Réservation refusée' : 'Réservation annulée',
    'Cette réservation ne donne plus accès au suivi du trajet.');
  if (!p.trip?.startedAt && isTripExpired(p.trip)) return unavailable('Trajet expiré',
    'Le départ prévu est passé sans démarrage. Vous pouvez choisir un autre trajet.', false, 'time-outline');
  // Completed rides keep their normal screen: payment, rating and receipts remain reachable.
  if (p.booking && p.trip) return { loading: false, feedback: null };
  if (p.booking?.status === 'completed') return unavailable('Trajet terminé',
    'Votre trajet est terminé. Retrouvez les détails dans vos réservations.', false, 'flag-outline');
  if (p.booking && !p.booking.tripId) return unavailable('Informations du trajet incomplètes',
    'Le trajet associé à cette réservation n’a pas pu être chargé. Réessayez.', true);
  if (p.online && p.loading) return { loading: true, feedback: null };
  if (!p.online || errors.some(e => ['FETCH_ERROR', 'TIMEOUT_ERROR'].includes(String(e?.status)))) {
    return unavailable('Connexion au trajet interrompue',
      'Vérifiez votre connexion. Le chargement reprendra dès son retour.', true, 'cloud-offline-outline');
  }
  return unavailable('Chargement du trajet impossible',
    'Nous n’arrivons pas à récupérer les informations pour le moment. Réessayez.', true);
}
