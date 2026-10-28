type DriverCardKind = 'booking' | 'dispatch' | 'nearby';

function label(value: unknown, limit = 160): string {
  return typeof value === 'string' ? value.slice(0, 1600).replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

/** Presentation only: never infer a fare from seats, a missing value or a route. */
export function driverNotificationCard(kind: DriverCardKind, data: Record<string, unknown>) {
  const rawPrice = data.ridePricePerSeat;
  const amount = (data.ridePriceKind === 'fare' || data.ridePriceKind === 'budget') &&
    typeof rawPrice === 'string' && /^\d{1,10}(\.\d{1,2})?$/.test(rawPrice)
    ? Number(rawPrice) : undefined;
  const price = amount === undefined ? '' : amount === 0 ? 'Gratuit'
    : `${data.ridePriceKind === 'budget' ? 'Budget : ' : ''}${amount.toLocaleString('fr-FR')} FC / place`;
  const departure = label(data.rideDeparture);
  const arrival = label(data.rideArrival);
  const route = arrival ? `${departure ? `${departure} → ` : 'Destination : '}${arrival}` : departure ? `Départ : ${departure}` : '';
  const seats = typeof data.rideSeats === 'string' && /^[1-9]\d?$/.test(data.rideSeats)
    ? `${data.rideSeats} place${data.rideSeats === '1' ? '' : 's'}` : '';
  const departureAt = typeof data.rideDepartureAt === 'string' ? Date.parse(data.rideDepartureAt) : NaN;
  const schedule = Number.isFinite(departureAt) ? `Départ : ${new Date(departureAt).toLocaleString('fr-FR', {
    timeZone: 'Africa/Kinshasa', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })}` : '';
  const legacy = label(data.invitationText, 800);
  return {
    title: price ? `Zwanga · ${price}` : kind === 'booking' ? 'Zwanga · Nouvelle réservation' : 'Zwanga · Demande près de vous',
    // Older pushes may carry their fare only in the body. Keep it without guessing.
    body: `${[price, route, [seats, schedule].filter(Boolean).join(' · '), !price ? legacy : ''].filter(Boolean).join('\n').slice(0, 900)}\nOuvrez Zwanga pour répondre.`.trim(),
  };
}

/** Scheduled/shared requests still need vehicle selection or passenger consent. */
export function driverNotificationActions(kind: DriverCardKind, data: Record<string, unknown>) {
  const action = (title: string, id: string) => ({ title, pressAction: { id, launchActivity: 'default' } });
  if (kind === 'nearby') return [
    action('Refuser', 'driver-ignore-nearby'),
    action(data.sharedTrip === true || data.sharedTrip === 'true' ? 'Voir la demande' : 'Accepter', 'driver-review-nearby'),
  ];
  return [action('Refuser', 'driver-decline'), action('Accepter', 'driver-accept')];
}
