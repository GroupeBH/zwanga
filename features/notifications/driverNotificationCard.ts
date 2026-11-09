import { requestTotalPrice } from '@/features/trip-request/requestPriceDisplay';
import { orderNotificationText } from './requestVisibility';

type DriverCardKind = 'booking' | 'dispatch' | 'nearby';

function label(value: unknown, limit = 160): string {
  return typeof value === 'string' ? value.slice(0, 1600).replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

/** Presentation only: total for commands, unit fare for published-trip bookings. */
export function driverNotificationCard(kind: DriverCardKind, data: Record<string, unknown>) {
  const rawPrice = data.ridePricePerSeat;
  const unitAmount = (data.ridePriceKind === 'fare' || data.ridePriceKind === 'budget') &&
    typeof rawPrice === 'string' && /^\d{1,10}(\.\d{1,2})?$/.test(rawPrice)
    ? Number(rawPrice) : undefined;
  const amount = kind === 'booking' ? unitAmount : requestTotalPrice(unitAmount, data.rideSeats);
  const price = amount == null ? '' : amount === 0 ? 'Gratuit'
    : `${data.ridePriceKind === 'budget' ? 'Budget : ' : ''}${amount.toLocaleString('fr-FR')} FC ${kind === 'booking' ? '/ place' : 'pour le trajet'}`;
  const departure = label(data.rideDeparture);
  const arrival = label(data.rideArrival);
  const route = arrival ? `${departure ? `${departure} → ` : 'Destination : '}${arrival}` : departure ? `Départ : ${departure}` : '';
  const seats = typeof data.rideSeats === 'string' && /^[1-9]\d?$/.test(data.rideSeats)
    ? `${data.rideSeats} place${data.rideSeats === '1' ? '' : 's'}` : '';
  const departureAt = typeof data.rideDepartureAt === 'string' ? Date.parse(data.rideDepartureAt) : NaN;
  const schedule = Number.isFinite(departureAt) ? `Départ : ${new Date(departureAt).toLocaleString('fr-FR', {
    timeZone: 'Africa/Kinshasa', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })}` : '';
  const legacy = orderNotificationText(label(data.invitationText, 800),
    { type: kind === 'booking' ? 'new_booking' : 'trip_request' });
  const legacyCommand = legacy.replace(/\d[\d\s.,]{0,24}FC(?:\s*(?:\/|par)\s*places?)?/gi, 'Prix à consulter dans Zwanga');
  return {
    title: price ? `Zwanga · ${price}` : kind === 'booking' ? 'Zwanga · Nouvelle réservation' : 'Zwanga · Commande près de vous',
    // Preserve legacy route/action copy, but never relabel a legacy unit amount as a total.
    body: `${[price, route, [seats, schedule].filter(Boolean).join(' · '), !price ? (kind === 'booking' ? legacy : legacyCommand) : ''].filter(Boolean).join('\n').slice(0, 900)}\nOuvrez Zwanga pour répondre.`.trim(),
  };
}

/** Scheduled/shared requests still need vehicle selection or passenger consent. */
export function driverNotificationActions(kind: DriverCardKind, data: Record<string, unknown>) {
  const action = (title: string, id: string) => ({ title, pressAction: { id, launchActivity: 'default' } });
  if (kind === 'booking' && data.ridePriceKind === 'budget') return [
    action('Refuser', 'driver-decline'), action('Voir le prix proposé', 'default'),
  ];
  if (kind === 'nearby') return [
    action('Refuser', 'driver-ignore-nearby'),
    action(data.sharedTrip === true || data.sharedTrip === 'true' ? 'Voir la commande' : 'Accepter', 'driver-review-nearby'),
  ];
  return [action('Refuser', 'driver-decline'), action('Accepter', 'driver-accept')];
}
