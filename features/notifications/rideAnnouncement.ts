import type { RideAlert } from './rideAlert';

const locationLabel = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const label = value.slice(0, 240).replace(/<[^>]*>/g, ' ')
    .replace(/[^\p{L}\p{N} ,.'’/()-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return /^(ma position actuelle|ma localisation|position actuelle)$/i.test(label)
    ? 'point indiqué par le passager' : label;
};

/** Only structured ride fields are read. Never speak the push body, names or phone numbers. */
export function buildRideAnnouncement(alert: RideAlert): string | null {
  if (alert.kind === 'response') return null;
  const parts = [alert.kind === 'booking' ? 'Nouvelle réservation sur votre trajet.' : 'Nouvelle commande près de vous.'];
  if (alert.data.rideSpeechVersion === '1') {
    const departure = locationLabel(alert.data.rideDeparture);
    const arrival = locationLabel(alert.data.rideArrival);
    if (departure) parts.push(`Départ : ${departure}.`);
    if (arrival) parts.push(`Arrivée : ${arrival}.`);
    const rawSeats = alert.data.rideSeats;
    const seats = typeof rawSeats === 'string' && /^\d{1,2}$/.test(rawSeats) ? Number(rawSeats) : 0;
    if (seats > 0) parts.push(`${seats} ${seats === 1 ? 'place demandée' : 'places demandées'}.`);
    const date = typeof alert.data.rideDepartureAt === 'string' ? new Date(alert.data.rideDepartureAt) : null;
    if (date && Number.isFinite(date.getTime())) {
      const day = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Africa/Kinshasa' });
      const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kinshasa' }).replace(':', ' heures ');
      parts.push(`Prévu le ${day} à ${time}.`);
    }
  }
  parts.push(alert.kind === 'nearby' ? 'Ouvrez la commande pour répondre.' : 'Acceptez ou refusez dans l’application.');
  return parts.join(' ');
}
