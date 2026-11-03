import type { RideAlert } from './rideAlert';

/** Fixed copy only: never read an arbitrary push body or private name aloud. */
export function passengerResponseNotice(alert: RideAlert) {
  if (alert.kind !== 'response') return null;
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
