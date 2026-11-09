import { requestTotalPrice } from '@/features/trip-request/requestPriceDisplay';
import type { RideAlert } from './rideAlert';

/** Fixed copy and a bounded numeric price, never an arbitrary push body or private name aloud. */
export function passengerResponseNotice(alert: RideAlert) {
  if (alert.kind !== 'response') return null;
  if (alert.data.type === 'offer_accepted') {
    const title = 'Le passager a accepté votre prix';
    const message = 'Retrouvez les lieux de départ et d’arrivée dans cette commande. Vous pouvez préparer la prise en charge.';
    return { title, message, speech: { key: `response-notice:${alert.key}`, text: `${title}. ${message}` } };
  }
  if (alert.data.type === 'driver_offer') {
    const title = 'Un conducteur propose un autre prix';
    const price = Number(alert.data.pricePerSeat);
    const total = Number.isSafeInteger(price) && price > 0 && price <= 1000000
      ? requestTotalPrice(price, alert.data.numberOfSeats ?? alert.data.rideSeats) : null;
    const amount = total !== null ? `Prix proposé pour le trajet : ${total.toLocaleString('fr-FR')} FC. ` : '';
    const message = `${amount}Ouvrez votre commande pour choisir « Accepter ce prix » ou « Refuser ce prix ».`;
    return { title, message, speech: { key: `response-notice:${alert.key}`, text: `${title}. ${message}` } };
  }
  const rejected = alert.data.status === 'rejected';
  const accepted = alert.data.type === 'trip_request_accepted' || alert.data.status === 'accepted';
  const title = rejected ? 'Réservation refusée' : alert.data.type === 'trip_request_accepted'
    ? 'Un conducteur a accepté' : accepted ? 'Réservation acceptée' : 'Réponse du conducteur';
  const message = rejected
    ? 'Le conducteur ne peut pas vous prendre. Vous pouvez chercher un autre trajet.'
    : accepted ? 'Retrouvez votre conducteur et les informations du trajet en touchant « Voir mon trajet ».'
      : 'Consultez les informations du trajet en touchant « Voir mon trajet ».';
  return { title, message, speech: { key: `response-notice:${alert.key}`, text: `${title}. ${message}` } };
}
