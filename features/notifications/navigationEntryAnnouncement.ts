import type { Booking, Trip } from '@/types';
import type { Waypoint } from '@/features/driver-navigation/navigationModel';
import { hasPassengerFinishedRide, ownsTrip } from '@/features/activity/tripParticipation';
import { rideSpeechLocationLabel } from './rideAnnouncement';
import type { RideEntryMessage } from '@/services/rideEntryAnnouncement';

export function buildDriverEntryAnnouncement(input: {
  userId?: string; trip?: Trip; interruption?: Booking | null; pending?: Booking | null;
  stopping: boolean; next?: Waypoint;
}): RideEntryMessage | null {
  const { trip, interruption, pending, stopping, next } = input;
  if (!trip || !ownsTrip(trip, input.userId) || !['ongoing', 'upcoming'].includes(trip.status)) return null;
  const message = (event: string, text: string) => ({ key: `driver:${trip.id}:${event}`, text });
  if (trip.status !== 'ongoing') return message('start', trip.startedAt
    ? 'Votre trajet est en pause. Pour repartir, appuyez sur Reprendre le trajet.'
    : 'Votre trajet n’a pas encore démarré. Quand vous êtes prêt, appuyez sur Démarrer le trajet.');
  if (interruption) return message(`stop:${interruption.id}`, 'Un passager demande à descendre ici. Confirmez ou refusez sa demande à l’écran.');
  if (pending) return message(`booking:${pending.id}`, 'Une nouvelle réservation attend votre réponse. Acceptez ou refusez à l’écran, une fois arrêté en sécurité.');
  if (stopping) return message('stopping', 'Votre demande d’arrêt est envoyée. Attendez la réponse des passagers.');
  const address = rideSpeechLocationLabel(next?.address);
  if (next && !next.completed) return message(`${next.type}:${next.id}`, next.type === 'pickup'
    ? `Votre trajet est en cours. Allez chercher le passager${address ? ` à ${address}` : ''}. Suivez la carte.`
    : `Un passager est à bord. Emmenez-le à son arrivée${address ? ` : ${address}` : ''}. Suivez la carte.`);
  return message('ongoing', 'Votre trajet est en cours. Suivez la carte. Pour voir les passagers, ouvrez Plus, puis Les arrêts.');
}

export function buildPassengerEntryAnnouncement(input: {
  userId?: string; trip?: Trip; booking?: Booking; canRespondToStop: boolean; stopRequested: boolean;
}): RideEntryMessage | null {
  const { booking, trip, userId } = input;
  if (!booking || !trip || booking.passengerId !== userId || booking.tripId !== trip.id ||
      !['accepted', 'completed'].includes(booking.status) || trip.status === 'cancelled') return null;
  const message = (event: string, text: string) => ({ key: `passenger:${booking.id}:${event}`, text });
  if (hasPassengerFinishedRide(booking)) return message('arrived', 'Votre arrivée est enregistrée. Consultez le règlement du trajet pour voir si un paiement reste à faire.');
  if (input.canRespondToStop) return message('driver-stop', 'Le conducteur souhaite arrêter le trajet. Confirmez ou refusez à l’écran.');
  if (input.stopRequested) return message('stop-requested', 'Vous avez demandé à descendre. Attendez la réponse du conducteur.');
  if (trip.status !== 'ongoing') return message('waiting-start', 'Votre réservation est acceptée. Le trajet n’a pas encore démarré. Vous pouvez contacter le conducteur avec le bouton Contacter.');
  if (booking.pickedUp || booking.pickedUpConfirmedByPassenger) return message('onboard', 'Votre trajet est en cours. À votre destination, confirmez votre arrivée si elle n’est pas détectée automatiquement.');
  return message('pickup', 'Le trajet a démarré. Retrouvez votre conducteur au point de départ. Une fois dans le véhicule, confirmez que vous êtes à bord si nécessaire.');
}
