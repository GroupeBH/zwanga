const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const origin = { latitude: -4.325, longitude: 15.3222 };
const later = delay => new Date(Date.now() + delay).toISOString();
const trip = (id, extra = {}) => ({
  id, driverId: 'driver', status: 'upcoming', departureTime: later(3600000),
  departure: { lat: -4.325, lng: 15.3223 }, arrival: { lat: -4.45, lng: 15.45 }, ...extra,
});
const native = { 'react-native': { StyleSheet: { create: value => value } } };
const { rankHomeTripsByProximity: rank } = loader(native)('features/home/homeTripPriority.ts');
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

test('Home ranks all eligible fetched trips before retaining ten results for the sheet and map', () => {
  const farTrips = Array.from({ length: 15 }, (_, i) => trip(`far-${i}`, { departure: { lat: -4.5, lng: 15.5 } }));
  const h = selection({ remoteTrips: Object.freeze([...farTrips, trip('closest'),
    trip('own', { driverId: 'me' }), trip('expired', { departureTime: '2020-01-01' }), trip('done')]), completedBookingTripIds: new Set(['done']) });
  const result = h.render();
  assert.equal(result.latestTrips[0].id, 'closest');
  assert.equal(result.latestTrips.length, 10);
  assert.equal(result.latestTrips.some(item => ['own', 'expired', 'done'].includes(item.id)), false);
  assert.equal(result.homeMapTrips, result.latestTrips);
  h.hooks.unmount();
});

test('cached trips are ranked offline and movement updates their order without reranking unchanged coordinates', () => {
  let calls = 0;
  const h = selection({ remoteTrips: undefined, storedTrips: [trip('a'), trip('b', { departure: { lat: -4.5, lng: 15.5 } })] }, {
    '@/features/home/homeTripPriority': { rankHomeTripsByProximity: (...args) => { calls++; return rank(...args); } },
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
