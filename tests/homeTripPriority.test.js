const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const origin = { latitude: -4.325, longitude: 15.3222 };
const later = delay => new Date(Date.now() + delay).toISOString();
const trip = (id, extra = {}) => ({
  id, driverId: 'driver', status: 'upcoming', departureTime: later(3600000),
  departure: { lat: -4.325, lng: 15.3223 }, arrival: { lat: -4.45, lng: 15.45 }, availableSeats: 3, ...extra,
});
const native = { 'react-native': { StyleSheet: { create: value => value } } };
const policy = loader(native)('features/home/homeTripPriority.ts');
const { rankHomeTripsByProximity: rank } = policy;
const ids = list => list.map(item => item.id);
const noBookings = new Set();

test('a closer departure outranks an earlier departure time, without changing cached trips', () => {
  const near = Object.freeze(trip('near', { departureTime: later(2 * 86400000) }));
  const far = Object.freeze(trip('far', { departure: { lat: -4.5, lng: 15.5 } }));
  const source = Object.freeze([far, near]);
  const sorted = rank(source, origin, noBookings);
  assert.deepEqual(ids(sorted), ['near', 'far']);
  assert.deepEqual(ids(source), ['far', 'near']);
  assert.equal(sorted[0], near);
});

test('ranking uses the departure, not the arrival or the driver live position', () => {
  const near = trip('near');
  const far = trip('far', { departure: { lat: -4.5, lng: 15.5 }, arrival: near.departure,
    currentLocation: { type: 'Point', coordinates: [origin.longitude, origin.latitude] } });
  assert.deepEqual(ids(rank([far, near], origin, noBookings)), ['near', 'far']);
});

test('within a 500-metre zone the earliest departure wins, then distance breaks time ties', () => {
  const early = later(600000), late = later(3600000);
  const closerLater = trip('closer-later', { departureTime: late });
  const slightlyFartherEarlier = trip('earlier', { departureTime: early,
    departure: { lat: origin.latitude + 0.002, lng: origin.longitude } });
  const fartherSameTime = trip('farther-same-time', { departureTime: early,
    departure: { lat: origin.latitude + 0.003, lng: origin.longitude } });
  const nextZoneEarlier = trip('next-zone', { departureTime: later(300000),
    departure: { lat: origin.latitude + 0.006, lng: origin.longitude } });
  assert.deepEqual(ids(rank([nextZoneEarlier, closerLater, fartherSameTime, slightlyFartherEarlier], origin, noBookings)),
    ['earlier', 'farther-same-time', 'closer-later', 'next-zone']);
});

test('unknown departure coordinates follow located trips without hiding them', () => {
  const unknown = [trip('missing', { departure: null }), trip('zero', { departure: { lat: 0, lng: 0 } }),
    trip('invalid', { departure: { lat: NaN, lng: 15 } }),
    trip('disabled', { departure: { lat: origin.latitude, lng: origin.longitude, hasCoordinates: false } })];
  const sorted = rank([...unknown, trip('known')], origin, noBookings);
  assert.equal(sorted[0].id, 'known'); assert.equal(sorted.length, 5);
});

test('missing or invalid user position keeps deterministic chronological ordering', () => {
  const a = trip('a', { departureTime: later(3600000) });
  const b = trip('b', { departureTime: a.departureTime });
  const early = trip('early', { departureTime: later(600000) });
  const invalid = trip('invalid', { departureTime: 'invalid' });
  for (const position of [undefined, null, { latitude: NaN, longitude: 15 }, { latitude: 0, longitude: 0 }]) {
    assert.deepEqual(ids(rank([invalid, b, a, early], position, noBookings)), ['early', 'a', 'b', 'invalid']);
  }
  assert.deepEqual(ids(rank([b, a], origin, noBookings)), ['a', 'b']);
});

test('existing reservations stay first, with an active reservation ahead of upcoming ones', () => {
  const active = trip('active', { status: 'ongoing', departure: { lat: -4.6, lng: 15.6 } });
  const reserved = trip('reserved', { departure: { lat: -4.5, lng: 15.5 } });
  assert.deepEqual(ids(rank([trip('near'), reserved, active], origin, new Set(['active', 'reserved']))), ['active', 'reserved', 'near']);
});

test('Home suggestions enforce 5 km and the next 24 hours before ranking, but retain reservations', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const at = delay => new Date(now + delay).toISOString();
  const inWindow = (id, extra = {}) => trip(id, { departureTime: at(3600000), ...extra });
  const records = Object.freeze([
    inWindow('near-future', { departureTime: at(24 * 3600000 + 1) }),
    inWindow('far', { departure: { lat: origin.latitude + 0.046, lng: origin.longitude } }),
    inWindow('just-inside', { departure: { lat: origin.latitude + 0.044, lng: origin.longitude } }),
    inWindow('last-hour', { departureTime: at(24 * 3600000) }),
    inWindow('near-soon', { departureTime: at(600000) }),
    inWindow('past', { departureTime: at(-1) }),
    inWindow('full', { availableSeats: 0 }),
    inWindow('invalid-date', { departureTime: 'invalid' }),
    inWindow('unknown-departure', { departure: null }),
    inWindow('started', { status: 'ongoing' }),
    inWindow('cancelled', { status: 'cancelled' }),
    inWindow('reserved', { departureTime: at(48 * 3600000), departure: { lat: -4.5, lng: 15.5 }, availableSeats: 0 }),
  ]);
  assert.deepEqual(ids(rank(records, origin, new Set(['reserved']), now, true)),
    ['reserved', 'near-soon', 'last-hour', 'just-inside']);
  assert.equal(records.length, 12, 'the shared discovery cache is not mutated');
  // Ranking outside this Home-only filter remains available for broader discovery.
  assert.equal(rank(records, origin, noBookings, now).length, 12);
});

test('without a valid position Home never advertises distant trips as nearby and still retains bookings', () => {
  const records = [trip('unknown-distance'), trip('booked')];
  for (const position of [null, undefined, { latitude: 0, longitude: 0 }, { latitude: NaN, longitude: 15 }]) {
    assert.deepEqual(ids(rank(records, position, new Set(['booked']), Date.now(), true)), ['booked', 'unknown-distance']);
    assert.equal(policy.getHomeTripSuggestionTier(records[0], position), policy.HOME_GENERAL_SUGGESTION_TIER);
  }
});

test('Home widens progressively only when the preceding tier has no suggestions', () => {
  const now = Date.now();
  const nextDay = trip('tomorrow', { departureTime: new Date(now + 36 * 3600000).toISOString() });
  const sevenKm = trip('7km', { departure: { lat: origin.latitude + 0.063, lng: origin.longitude } });
  const twentyKm = trip('20km', { departure: { lat: origin.latitude + 0.18, lng: origin.longitude } });
  const nextWeek = trip('next-week', { departureTime: new Date(now + 7 * 86400000).toISOString() });
  const tooLate = trip('too-late', { departureTime: new Date(now + 7 * 86400000 + 1).toISOString() });
  const tooFar = trip('too-far', { departure: { lat: origin.latitude + 0.24, lng: origin.longitude } });
  const records = Object.freeze([tooLate, tooFar, nextWeek, twentyKm, sevenKm, nextDay]);
  assert.deepEqual(ids(rank([trip('near'), ...records], origin, noBookings, now, true)), ['near']);
  assert.deepEqual(ids(rank(records, origin, noBookings, now, true)), ['tomorrow', '7km']);
  assert.deepEqual(ids(rank([twentyKm, nextWeek, tooLate, tooFar], origin, noBookings, now, true)), ['next-week', '20km']);
  assert.deepEqual(ids(rank([tooLate, tooFar], origin, noBookings, now, true)), ['too-far', 'too-late']);
});

test('reserved nearby trips do not prevent wider suggestions and unusable records never qualify', () => {
  const wider = trip('wider', { departureTime: later(36 * 3600000) });
  const invalid = [trip('full', { availableSeats: 0 }), trip('cancelled', { status: 'cancelled' }),
    trip('invalid', { departureTime: 'invalid' }), trip('past', { departureTime: later(-60000) }),
    trip('completed', { status: 'completed' }), trip('ongoing', { status: 'ongoing' })];
  assert.deepEqual(ids(rank([trip('booked'), ...invalid, wider], origin, new Set(['booked']), Date.now(), true)), ['booked', 'wider']);
  invalid.forEach(item => assert.equal(policy.getHomeTripSuggestionTier(item, origin), -1));
});

function selection(initial = {}, mocks = {}) {
  const hooks = hookHarness();
  const props = {
    remoteTrips: [], storedTrips: [], activeBookings: [], currentUser: { id: 'me' },
    completedBookingTripIds: new Set(), bookedTripIds: new Set(), refreshedPassengerTrip: undefined,
    trackedTripInfo: null, ongoingDriverTrip: null, isDriver: false,
    driverReservationHighlightTrip: null, driverReservationHighlightBookings: [], myDriverTrips: [],
    liveUserCoordinate: origin, ...initial,
  };
  const { useHomeTripSelection } = loader({ ...native, react: hooks.react, ...mocks })('hooks/home/useHomeTripSelection.ts');
  const render = () => hooks.render(() => useHomeTripSelection(props));
  return { props, hooks, render };
}

test('Home explains wider suggestions, hides the hint again for nearby trips and keeps bookings', () => {
  const h = selection({ remoteTrips: [trip('later', { departureTime: later(36 * 3600000) })] });
  assert.match(h.render().suggestionScopeLabel, /10 km.*48 h/);
  h.props.remoteTrips = [trip('week', { departureTime: later(5 * 86400000) })];
  assert.match(h.render().suggestionScopeLabel, /25 km.*7 jours/);
  h.props.remoteTrips = [...h.props.remoteTrips, trip('near')];
  assert.equal(h.render().suggestionScopeLabel, null);
  assert.deepEqual(ids(h.render().latestTrips), ['near']);
  h.props.bookedTripIds = new Set(['near']);
  assert.deepEqual(ids(h.render().latestTrips), ['near', 'week']);
  h.hooks.unmount();
});

test('Home ranks all eligible fetched trips before retaining ten results for the sheet and map', () => {
  const farTrips = Array.from({ length: 15 }, (_, i) => trip(`far-${i}`, { departure: { lat: -4.34, lng: 15.34 } }));
  const h = selection({ remoteTrips: Object.freeze([...farTrips, trip('closest'),
    trip('own', { driverId: 'me' }), trip('expired', { departureTime: '2020-01-01' }), trip('done')]), completedBookingTripIds: new Set(['done']) });
  const result = h.render();
  assert.equal(result.latestTrips[0].id, 'closest');
  assert.equal(result.latestTrips.length, 10);
  assert.equal(result.latestTrips.some(item => ['own', 'expired', 'done'].includes(item.id)), false);
  assert.equal(result.homeMapTrips, result.latestTrips);
  h.hooks.unmount();
});

test('cached nearby trips stay first; missing GPS falls back to other departures but never terminal trips', () => {
  const far = trip('far', { departure: { lat: -4.5, lng: 15.5 } });
  const booked = trip('reserved', { departureTime: later(48 * 3600000), departure: far.departure });
  const h = selection({ remoteTrips: undefined, storedTrips: [far, trip('later', { departureTime: later(48 * 3600000) }),
    trip('cancelled', { status: 'cancelled' }), trip('completed', { status: 'completed' }), trip('near')],
    bookedTripIds: new Set(['reserved']), activeBookings: [{ id: 'booking', passengerId: 'me', status: 'accepted', trip: booked, tripId: booked.id }] });
  assert.deepEqual(ids(h.render().latestTrips), ['reserved', 'near']);
  h.props.liveUserCoordinate = null;
  assert.equal(h.render().latestTrips[0].id, 'reserved');
  assert.deepEqual(new Set(ids(h.render().latestTrips)), new Set(['reserved', 'far', 'near', 'later']));
  assert.equal(h.render().suggestionScopeLabel, 'Autres trajets disponibles');
  assert.equal(h.render().hasTripLocation, false);
  h.props.liveUserCoordinate = origin;
  assert.equal(h.render().hasTripLocation, true);
  assert.deepEqual(ids(h.render().latestTrips), ['reserved', 'near']);
  h.hooks.unmount();
});

test('Home shows distant or much later departures instead of an empty list, even without GPS', () => {
  const distant = trip('far-away', { departure: { lat: -4.7, lng: 15.7 }, departureTime: later(2 * 86400000) });
  const laterNearby = trip('later-nearby', { departureTime: later(20 * 86400000) });
  const records = [laterNearby, distant, trip('invalid-date', { departureTime: 'not-a-date' }),
    trip('own', { driverId: 'me' }), trip('full', { availableSeats: 0 }), trip('ended', { status: 'completed' })];
  const h = selection({ remoteTrips: records });
  assert.deepEqual(ids(h.render().latestTrips), ['far-away', 'later-nearby'], 'unrestricted fallback prefers earlier departures');
  assert.equal(h.render().suggestionScopeLabel, 'Autres trajets disponibles');
  h.props.liveUserCoordinate = null;
  assert.deepEqual(ids(h.render().latestTrips), ['far-away', 'later-nearby']);
  h.props.remoteTrips = [trip('no-coordinates', { departure: { name: 'Adresse sans point GPS' } })];
  assert.deepEqual(ids(h.render().latestTrips), ['no-coordinates']);
  h.props.liveUserCoordinate = origin;
  h.props.remoteTrips = [...records, trip('close-now')];
  assert.deepEqual(ids(h.render().latestTrips), ['close-now']);
  assert.equal(h.render().suggestionScopeLabel, null);
  h.hooks.unmount();
});

test('general suggestions remain limited to ten visible cards and retain personal bookings first', () => {
  const records = Array.from({ length: 60 }, (_, index) => trip(`far-${index}`, {
    departure: { lat: -4.7, lng: 15.7 }, departureTime: later((index + 1) * 3600000) }));
  const h = selection({ remoteTrips: records, bookedTripIds: new Set(['far-59']) });
  const result = h.render();
  assert.equal(result.latestTrips.length, 10);
  assert.deepEqual(ids(result.latestTrips), ['far-59', ...records.slice(0, 9).map(item => item.id)]);
  assert.equal(records.length, 60, 'shared records are not mutated');
  h.hooks.unmount();
});

test('existing feed refreshes and foreground entry re-evaluate the time window without new timers', t => {
  let now = Date.parse('2026-10-10T12:00:00Z');
  t.mock.method(Date, 'now', () => now);
  const h = selection({ isScreenActive: true, discoveryUpdatedAt: now,
    remoteTrips: [trip('soon', { departureTime: later(30000) }), trip('next-day', { departureTime: later(24 * 3600000 + 30000) })] });
  const first = h.render().latestTrips;
  assert.deepEqual(ids(first), ['soon']);
  for (let i = 0; i < 100; i++) assert.equal(h.render().latestTrips, first);
  now += 60000;
  h.props.discoveryUpdatedAt = now;
  assert.deepEqual(ids(h.render().latestTrips), ['next-day']);
  h.props.isScreenActive = false; h.render();
  now += 24 * 3600000;
  h.props.isScreenActive = true;
  assert.deepEqual(ids(h.render().latestTrips), []);
  h.hooks.unmount();
});

test('cached trips are ranked offline and movement updates their order without reranking unchanged coordinates', () => {
  let calls = 0;
  const h = selection({ remoteTrips: undefined, storedTrips: [trip('a'), trip('b', { departure: { lat: -4.5, lng: 15.5 } })] }, {
    '@/features/home/homeTripPriority': { ...policy, rankHomeTripsByProximity: (...args) => { calls++; return rank(...args); } },
  });
  const first = h.render();
  assert.equal(first.latestTrips[0].id, 'a');
  h.props.liveUserCoordinate = { ...origin };
  assert.equal(h.render().latestTrips, first.latestTrips); assert.equal(calls, 1);
  h.props.liveUserCoordinate = { latitude: -4.5, longitude: 15.5 };
  assert.equal(h.render().latestTrips[0].id, 'b'); assert.equal(calls, 2);
  h.hooks.unmount();
});

test('the ongoing booked trip remains selected even with more than ten nearby upcoming reservations', () => {
  const active = trip('active', { status: 'ongoing', departureTime: '2020-01-01', departure: { lat: -4.6, lng: 15.6 } });
  const reserved = [...Array.from({ length: 12 }, (_, i) => trip(`reserved-${i}`)), active];
  const h = selection({ remoteTrips: [], bookedTripIds: new Set(ids(reserved)),
    activeBookings: reserved.map(item => ({ id: `booking-${item.id}`, passengerId: 'me', tripId: item.id, trip: item, status: 'accepted' })) });
  const result = h.render();
  assert.equal(result.ongoingBookedTrip, active);
  assert.equal(result.activeHomeTrip, active);
  assert.deepEqual(result.homeMapTrips, [active]);
  h.hooks.unmount();
});

test('Home forwards its existing location to the published-trip selection', () => {
  let selectedProps;
  const hookNames = ['useHomeContext', 'useHomeDriverActivity', 'useHomeLocation', 'useHomeMap', 'useHomeMapNavigation',
    'useHomePassengerActivity', 'useHomePassengerMarkers', 'useHomeSheet', 'useHomeTracking', 'useHomeTripFeed',
    'useHomeTripSelection', 'useHomeUserLocation', 'useHomeRequestHighlight', 'useHomePriorityDismissals'];
  const mocks = Object.fromEntries(hookNames.map(name => [`./${name}`, { [name]: () => ({}) }]));
  mocks['./useHomeLocation'].useHomeLocation = () => ({ liveUserCoordinate: origin });
  mocks['./useHomeTripSelection'].useHomeTripSelection = props => { selectedProps = props; return {}; };
  loader(mocks)('hooks/home/useHomeController.ts').useHomeController();
  assert.equal(selectedProps.liveUserCoordinate, origin);
});
