import type { Booking, Trip, TripRequest } from '@/types';
import type { RideEntryMessage } from '@/services/rideEntryAnnouncement';
import { ownsTrip } from '@/features/activity/tripParticipation';
import { rideSpeechLocationLabel } from './rideAnnouncement';

const route = (departure: unknown, arrival: unknown) => {
  const from = rideSpeechLocationLabel(departure), to = rideSpeechLocationLabel(arrival);
  return `${from ? ` Départ : ${from}.` : ''}${to ? ` Arrivée : ${to}.` : ''}`;
};
export function buildManageTripEntry(userId: string | undefined, trip: Trip | undefined, bookings: Booking[] | undefined): RideEntryMessage | null {
  if (!trip || !ownsTrip(trip, userId) || !['upcoming', 'ongoing'].includes(trip.status)) return null;
  const pending = bookings?.find(booking => booking.tripId === trip.id && booking.status === 'pending');
  if (pending) return { key: `manage-booking:${pending.id}`, text:
    `Une réservation attend votre réponse.${route(pending.passengerOrigin || trip.departure.address, pending.passengerDestination || trip.arrival.address)} Acceptez ou refusez à l’écran.` };
  return { key: `manage-trip:${trip.id}:${trip.status}`, text: trip.status === 'ongoing'
    ? 'Votre trajet est en cours. Ouvrez la navigation pour retrouver vos passagers.'
    : 'Votre trajet est prévu. Retrouvez ici vos passagers et le bouton pour démarrer quand vous êtes prêt.' };
}

export function buildRequestDetailEntry(input: {
  userId?: string; request?: TripRequest; isDriver: boolean; canAccept: boolean; assigned: boolean;
}): RideEntryMessage | null {
  const { userId, request, isDriver, canAccept, assigned } = input;
  if (!userId || !request || (!isDriver && request.passengerId !== userId)) return null;
  const own = request.passengerId === userId;
  const key = `request-detail:${request.id}:${request.status}:${own}:${canAccept}:${assigned}`;
  if (request.status === 'cancelled' || request.status === 'expired') return { key, text: 'Cette commande n’est plus disponible. Revenez à l’accueil.' };
  const addresses = route(request.departure.address, request.arrival.address);
  if (own) return { key, text: request.status === 'driver_selected'
    ? 'Un conducteur a accepté votre commande. Ouvrez votre trajet pour le retrouver.'
    : request.status === 'offers_received'
      ? `Une proposition vous attend.${addresses} Consultez les propositions et choisissez votre conducteur.`
      : `Votre commande est en cours.${addresses} Attendez la réponse d’un conducteur. Vous serez averti.` };
  if (assigned) return { key, text: 'Vous avez accepté cette commande. Ouvrez le trajet pour retrouver votre client.' };
  if (request.selectedDriverId || !['pending', 'offers_received'].includes(request.status))
    return { key, text: 'Cette commande n’attend plus votre réponse. Revenez à l’accueil pour voir les autres clients.' };
  return { key, text: `Un client cherche un véhicule.${addresses} ${canAccept
    ? 'Acceptez ou refusez à l’écran. Vous pouvez aussi contacter le client.'
    : 'Consultez les conditions affichées avant de répondre.'}` };
}
