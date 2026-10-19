const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const load = loader();
const home = load('features/notifications/homeEntryAnnouncement.ts').buildHomeEntryAnnouncement;
const { buildDriverEntryAnnouncement: driver, buildPassengerEntryAnnouncement: passenger } = load('features/notifications/navigationEntryAnnouncement.ts');
const trip = { id: 'trip', driverId: 'driver', status: 'upcoming', departure: { address: 'Place centrale' }, arrival: { address: 'Gare' } };
const booking = { id: 'booking', tripId: trip.id, passengerId: 'passenger', status: 'pending', numberOfSeats: 1 };
const request = { id: 'request', passengerId: 'passenger', status: 'pending', departure: trip.departure, arrival: trip.arrival };
const base = { userId: 'driver', isDriver: true, activeBookings: [] };

test('Home reads the first visible priority, not a nearby request ahead of a booking or planned ride', () => {
  const events = { ...base, featuredDriverReservation: { booking, trip }, featuredDriverUpcomingTrip: trip, highlightedDriverRequest: request };
  assert.match(home(events).text, /réservation attend votre réponse.*Départ : Place centrale.*acceptez ou refusez/);
  events.featuredDriverReservation = null;
  assert.match(home(events).text, /trajet prévu.*Ouvrez votre trajet/);
  events.featuredDriverUpcomingTrip = null;
  assert.match(home(events).text, /client cherche un véhicule.*Ouvrez la commande/);
  events.highlightedDriverRequest = null;
  assert.equal(home(events), null, 'do not fabricate an event on empty Home');
});

test('Home passenger guidance distinguishes pending, accepted, proposals and driver selection', () => {
  const events = { userId: 'passenger', isDriver: false, activeBookings: [booking], featuredPassengerTrip: trip };
  assert.match(home(events).text, /attend la réponse du conducteur/);
  assert.ok(!home(events).text.includes('acceptez ou refusez'));
  events.activeBookings = [{ ...booking, status: 'accepted' }];
  assert.match(home(events).text, /réservation est acceptée.*lieu de départ/);
  delete events.featuredPassengerTrip;
  events.activeTripRequest = request;
  assert.match(home(events).text, /cherchons un conducteur.*Attendez la réponse/);
  events.activeTripRequest = { ...request, status: 'offers_received' };
  assert.match(home(events).text, /proposition.*voir la proposition et répondre/);
  events.activeTripRequest = { ...request, status: 'driver_selected' };
  assert.match(home(events).text, /conducteur est confirmé.*contacter votre conducteur/);
});

test('an account able to drive can still receive passenger instructions for its own booking; foreign personal data is ignored', () => {
  const events = { ...base, activeBookings: [{ ...booking, passengerId: 'driver', status: 'accepted' }], featuredPassengerTrip: trip };
  assert.match(home(events).text, /Votre réservation est acceptée/);
  events.activeBookings = [booking]; assert.equal(home(events), null);
  assert.equal(home({ ...base, activeTripRequest: request }), null);
  assert.equal(home({ ...base, highlightedDriverRequest: { ...request, passengerId: 'driver' } }), null);
});

test('spoken Home text stays bounded and excludes name, phone, arbitrary notification bodies and markup', () => {
  const text = home({ ...base, featuredDriverReservation: {
    trip, booking: { ...booking, passengerOrigin: '<b>Place</b>\n' + 'a'.repeat(2000),
      passengerName: 'DO NOT READ NAME', passengerPhone: 'DO NOT READ PHONE', body: 'DO NOT READ BODY' },
  } }).text;
  assert.ok(text.length < 300); assert.ok(!text.includes('<b>')); assert.ok(!text.includes('DO NOT READ'));
});

test('driver priority is interruption then pending booking then the next stop, without asking to start a completed trip', () => {
  const input = { userId: 'driver', trip: { ...trip, status: 'ongoing' }, stopping: false,
    interruption: booking, pending: booking, next: { id: 'stop', type: 'pickup', address: 'Place centrale' } };
  assert.match(driver(input).text, /passager demande à descendre.*Confirmez ou refusez/);
  input.interruption = null; assert.match(driver(input).text, /réservation.*arrêté en sécurité/);
  input.pending = null; assert.match(driver(input).text, /Allez chercher le passager à Place centrale/);
  input.next.type = 'dropoff'; assert.match(driver(input).text, /passager est à bord.*Emmenez-le/);
  input.stopping = true; assert.match(driver(input).text, /Attendez la réponse des passagers/);
  input.trip.status = 'completed'; assert.equal(driver(input), null);
  assert.equal(driver({ ...input, trip, userId: 'other' }), null);
  assert.match(driver({ ...input, trip }).text, /Quand vous êtes prêt.*Démarrer/);
  assert.match(driver({ ...input, trip: { ...trip, startedAt: '2026-10-19T09:00:00Z' } }).text, /Reprendre le trajet/);
});

test('passenger role follows the booking, with guarded ride stages and no forced payment or premature boarding', () => {
  const input = { userId: 'passenger', trip: { ...trip, status: 'ongoing' }, booking: { ...booking, status: 'accepted' }, canRespondToStop: false, stopRequested: false };
  assert.match(passenger(input).text, /Une fois dans le véhicule/);
  input.booking.pickedUp = true; assert.match(passenger(input).text, /À votre destination.*si elle n’est pas détectée automatiquement/);
  input.canRespondToStop = true; assert.match(passenger(input).text, /conducteur souhaite arrêter.*Confirmez ou refusez/);
  input.booking.droppedOff = true; assert.match(passenger(input).text, /arrivée est enregistrée.*si un paiement reste à faire/);
  assert.equal(passenger({ ...input, userId: 'driver' }), null);
  assert.equal(passenger({ ...input, booking: { ...booking, status: 'cancelled' } }), null);
  assert.equal(passenger({ ...input, trip: { ...trip, id: 'other' } }), null);
});

function registryFixture(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const registry = loader()('services/rideEntryAnnouncement.ts');
  const source = { userId: 'driver', path: '/', ready: true, message: { key: 'booking', text: 'Une réservation attend votre réponse.' } };
  const token = {};
  return { registry, source, token, settle: () => t.mock.timers.tick(501) };
}

test('entry registry gates startup role/ride and waits for matching screen, not retained Home below navigation', t => {
  const { registry: r, source, token, settle } = registryFixture(t);
  // React child effects can publish before the parent's gate effect.
  r.publishRideEntrySource(token, source); r.setRideSpeechEntryGate({ userId: 'driver', path: '/', blocked: true }); settle();
  assert.equal(r.readRideSpeechEntry('driver').status, 'waiting');
  r.setRideSpeechEntryGate({ userId: 'driver', path: '/', blocked: false }); settle();
  assert.equal(r.readRideSpeechEntry('driver').message.key, 'booking');
  r.setRideSpeechEntryGate({ userId: 'driver', path: '/booking/navigate/ride', blocked: false }); settle();
  assert.equal(r.readRideSpeechEntry('driver').status, 'waiting');
  r.publishRideEntrySource({}, { ...source, path: '/booking/navigate/ride', message: { key: 'passenger', text: 'Votre trajet est en cours.' } }); settle();
  assert.equal(r.readRideSpeechEntry('driver').message.key, 'passenger');
});

test('registry consumes once per entry, invalidates stale sources, has a finite timeout and no cross-account reuse', t => {
  const { registry: r, source, token, settle } = registryFixture(t);
  r.setRideSpeechEntryGate({ userId: 'driver', path: '/', blocked: false }); r.publishRideEntrySource(token, source); settle();
  const first = r.readRideSpeechEntry('driver'); r.consumeRideSpeechEntry(first);
  assert.equal(r.readRideSpeechEntry('driver').status, 'done');
  r.publishRideEntrySource(token, { ...source }); assert.equal(r.isRideSpeechEntryCurrent(first), true, 'identical renders are stable');
  r.beginRideSpeechEntry('driver'); settle(); assert.equal(r.readRideSpeechEntry('driver').status, 'ready');
  assert.equal(r.isRideSpeechEntryCurrent(first), false);
  r.beginRideSpeechEntry('other'); r.setRideSpeechEntryGate({ userId: 'other', path: '/', blocked: false }); settle();
  assert.equal(r.readRideSpeechEntry('driver').status, 'waiting', 'a stale profile cannot enable old-account notification speech');
  assert.equal(r.readRideSpeechEntry('other').status, 'waiting');
  t.mock.timers.tick(30001); assert.equal(r.hasPendingRideSpeechEntry('other'), false);
  assert.equal(r.readRideSpeechEntry('other').status, 'expired');
  r.clearRideSpeechEntry(); assert.equal(r.readRideSpeechEntry('other').status, 'unmanaged');
});

test('source hook publishes only active screen data and removes it on unmount', t => {
  const { registry: r, source, settle } = registryFixture(t), hooks = hookHarness();
  const hook = loader({ react: hooks.react, 'expo-router': { usePathname: () => '/' },
    '@/services/rideEntryAnnouncement': r })('hooks/notifications/useRideEntryAnnouncement.ts').useRideEntryAnnouncement;
  r.setRideSpeechEntryGate({ userId: 'driver', path: '/', blocked: false });
  const render = (active, ready) => hooks.render(() => hook('driver', active, ready, source.message));
  render(true, false); settle(); assert.equal(r.readRideSpeechEntry('driver').status, 'waiting');
  render(true, true); settle(); assert.equal(r.readRideSpeechEntry('driver').status, 'ready');
  render(false, true); settle(); assert.equal(r.readRideSpeechEntry('driver').status, 'waiting');
  render(true, true); settle(); hooks.unmount(); settle(); assert.equal(r.readRideSpeechEntry('driver').status, 'waiting');
});
