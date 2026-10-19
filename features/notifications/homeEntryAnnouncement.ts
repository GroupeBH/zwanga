import type { Booking, Trip, TripRequest } from '@/types';
import type { FeaturedDriverReservation } from '@/features/home/homeTypes';
import type { RideEntryMessage } from '@/services/rideEntryAnnouncement';
import { rideSpeechLocationLabel } from './rideAnnouncement';
import { ownsTrip } from '@/features/activity/tripParticipation';

type HomeEvents = {
  userId: string; isDriver: boolean;
  featuredDriverReservation?: FeaturedDriverReservation | null;
  featuredDriverUpcomingTrip?: Trip | null;
  featuredPassengerTrip?: Trip | null;
  activeBookings: Booking[];
  highlightedDriverRequest?: TripRequest | null;
  activeTripRequest?: TripRequest | null;
};
const route = (departure: unknown, arrival: unknown) => {
  const from = rideSpeechLocationLabel(departure), to = rideSpeechLocationLabel(arrival);
  return `${from ? ` Départ : ${from}.` : ''}${to ? ` Arrivée : ${to}.` : ''}`;
};

/** Same order and selected entities as HomeActivityCards, not notification arrival order. */
export function buildHomeEntryAnnouncement(events: HomeEvents): RideEntryMessage | null {
  const reservation = events.isDriver && events.featuredDriverReservation;
  if (reservation && ownsTrip(reservation.trip, events.userId) && reservation.booking.tripId === reservation.trip.id && reservation.booking.status === 'pending') return {
    key: `booking:${reservation.booking.id}`,
    text: `Une réservation attend votre réponse.${route(reservation.booking.passengerOrigin || reservation.trip.departure.address,
      reservation.booking.passengerDestination || reservation.trip.arrival.address)} Ouvrez la réservation, puis acceptez ou refusez.`,
  };
  const upcoming = events.isDriver && events.featuredDriverUpcomingTrip;
  if (upcoming && ownsTrip(upcoming, events.userId) && upcoming.status === 'upcoming') return {
    key: `driver-trip:${upcoming.id}`,
    text: `Vous avez un trajet prévu.${route(upcoming.departure.address, upcoming.arrival.address)} Ouvrez votre trajet pour voir le départ et vos passagers.`,
  };
  const trip = events.featuredPassengerTrip;
  const booking = trip && events.activeBookings.find(item => item.tripId === trip.id && item.passengerId === events.userId);
  if (trip && booking && ['pending', 'accepted'].includes(booking.status)) return {
    key: `passenger-booking:${booking.id}:${booking.status}`,
    text: `${booking.status === 'accepted' ? 'Votre réservation est acceptée.' : 'Votre réservation attend la réponse du conducteur.'}${route(booking.passengerOrigin || trip.departure.address,
      booking.passengerDestination || trip.arrival.address)} ${booking.status === 'accepted'
      ? 'Ouvrez le trajet pour retrouver votre conducteur et le lieu de départ.' : 'Vous pouvez ouvrir le trajet pour contacter le conducteur.'}`,
  };
  const nearby = events.isDriver && events.highlightedDriverRequest;
  if (nearby && nearby.passengerId !== events.userId) return {
    key: `nearby:${nearby.id}`,
    text: `Un client cherche un véhicule.${route(nearby.departure.address, nearby.arrival.address)} Ouvrez la commande pour répondre.`,
  };
  const request = events.activeTripRequest;
  if (!request || request.passengerId !== events.userId) return null;
  const offers = request.status === 'offers_received' || request.offers?.some(offer => offer.status === 'pending');
  return {
    key: `own-request:${request.id}:${request.status}:${Boolean(offers)}`,
    text: `${request.status === 'driver_selected' ? 'Un conducteur est confirmé pour votre commande.' : offers
      ? 'Vous avez une proposition pour votre commande.' : 'Votre commande est en cours. Nous cherchons un conducteur.'}${route(request.departure.address, request.arrival.address)} ${request.status === 'driver_selected'
      ? 'Ouvrez la commande pour contacter votre conducteur.' : offers
        ? 'Ouvrez la commande pour voir la proposition et répondre.' : 'Attendez la réponse d’un conducteur. Vous serez averti.'}`,
  };
}
