const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const native = { 'react-native': { StyleSheet: { create: value => value } } };
const load = loader(native);
const slice = load('store/slices/homePriorityDismissalsSlice.ts');
const highlights = load('store/slices/homeRequestHighlightsSlice.ts');
const { homePriorityKeys: keys, shouldDismissHomePriority: shouldDismiss } = load('features/home/homePriorityDismissal.ts');
const hide = (key, userId = 'driver') => slice.dismissHomePriority({ key, userId });
const later = delay => new Date(Date.now() + delay).toISOString();
const trip = (id, delay = 300000) => ({ id, driverId: 'driver', status: 'upcoming', departureTime: later(delay),
  departure: { name: 'Gombe', lat: -4.325, lng: 15.3222 }, arrival: { name: 'Lemba', lat: -4.35, lng: 15.35 } });
const request = id => ({ id, passengerId: 'passenger', status: 'pending', departureDateMin: later(300000),
  departureDateMax: later(3600000), departure: trip('t').departure, arrival: trip('t').arrival, offers: [] });

test('dismissals are serializable, idempotent and bounded without storing trip data', () => {
  let state = slice.default(undefined, hide('trip:first'));
  assert.equal(slice.default(state, hide('trip:first')), state);
  state = slice.default(state, hide('trip:second'));
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  assert.deepEqual(state.keys, { 'trip:first': true, 'trip:second': true });
  for (let i = 0; i < 250; i++) state = slice.default(state, hide(`trip:${i}`));
  assert.equal(Object.keys(state.keys).length, 200);
  assert.equal(state.keys['trip:249'], true);
  assert.equal(state.keys['trip:first'], undefined);
  assert.ok(Object.values(state.keys).every(value => value === true));
});

test('accounts never share dismissals and logout/reset clear the session', () => {
  let state = slice.default(undefined, hide('trip:first'));
  state = slice.default(state, hide('trip:other', 'other'));
  assert.deepEqual(state.keys, { 'trip:other': true });
  for (const type of ['auth/logout', 'auth/performLogout/fulfilled', 'auth/performLogout/rejected', slice.resetHomePriorityDismissals.type]) {
    assert.deepEqual(slice.default(state, { type }), { userId: null, keys: {} });
  }
  assert.equal(slice.default(state, hide('', 'other')), state);
  assert.equal(slice.default(state, hide('x'.repeat(401), 'other')), state);
});

test('refreshes preserve dismissal keys, while changed departure times or new offers can be shown', () => {
  const t = trip('t'), r = request('r');
  assert.equal(keys.upcomingTrip({ ...t, updatedAt: later(1000) }), keys.upcomingTrip(t));
  assert.equal(keys.nearbyRequest({ ...r, updatedAt: later(1000) }), keys.nearbyRequest(r));
  assert.equal(keys.ownRequest({ ...r, updatedAt: later(1000) }), keys.ownRequest(r));
  assert.notEqual(keys.upcomingTrip({ ...t, departureTime: later(7200000) }), keys.upcomingTrip(t));
  assert.notEqual(keys.ownRequest({ ...r, offers: [{ id: 'new' }] }), keys.ownRequest(r));
  assert.notEqual(keys.ownRequest({ ...r, status: 'driver_selected' }), keys.ownRequest(r));
});

test('a tap or small drag does not dismiss; deliberate drags and flicks work in both directions', () => {
  for (const sign of [-1, 1]) {
    assert.equal(shouldDismiss(sign * 100, 0, 320), true);
    assert.equal(shouldDismiss(sign * 40, sign * 900, 320), true);
    assert.equal(shouldDismiss(sign * 40, -sign * 900, 320), false);
    assert.equal(shouldDismiss(sign * 20, sign * 1200, 320), false);
    assert.equal(shouldDismiss(sign * 70, 0, 320), false);
    assert.equal(shouldDismiss(sign * 100, 0, 700), false);
  }
  assert.equal(shouldDismiss(0, 0, 320), false);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.equal(shouldDismiss(invalid, 900, 320), false);
    assert.equal(shouldDismiss(150, invalid, 320), false);
    assert.equal(shouldDismiss(150, 900, invalid), false);
  }
  assert.equal(shouldDismiss(150, 900, 0), false);
  assert.equal(shouldDismiss(150, 900, -1), false);
});

test('the dismiss hook keeps actions stable, preserves hidden cards and isolates a different account', () => {
  const store = configureStore({ reducer: { homePriorityDismissals: slice.default } });
  const hooks = hookHarness();
  const { useHomePriorityDismissals } = loader({ react: hooks.react,
    '@/store/hooks': { useAppDispatch: () => store.dispatch, useAppSelector: selector => selector(store.getState()) },
  })('hooks/home/useHomePriorityDismissals.ts');
  const render = id => hooks.render(() => useHomePriorityDismissals(id));
  const first = render('driver');
  first.dismissPriority('trip:first');
  assert.equal(render('driver').dismissPriority, first.dismissPriority);
  assert.equal(render('driver').hiddenHomePriorities['trip:first'], true);
  assert.deepEqual(render('other').hiddenHomePriorities, {});
  assert.deepEqual(render('driver').hiddenHomePriorities, { 'trip:first': true });
  render(undefined).dismissPriority('trip:ignored');
  assert.deepEqual(render('driver').hiddenHomePriorities, { 'trip:first': true });
  hooks.unmount();
});

test('hiding an upcoming trip selects the next priority without changing map/list references or ongoing navigation', () => {
  const hooks = hookHarness();
  const { useHomeTripSelection } = loader({ ...native, react: hooks.react })('hooks/home/useHomeTripSelection.ts');
  const a = trip('first'), b = trip('next', 600000);
  const props = { remoteTrips: [{ ...trip('public'), driverId: 'other' }], storedTrips: [], activeBookings: [],
    currentUser: { id: 'driver' }, completedBookingTripIds: new Set(), bookedTripIds: new Set(),
    trackedTripInfo: null, ongoingDriverTrip: null, isDriver: true,
    driverReservationHighlightTrip: null, driverReservationHighlightBookings: [], myDriverTrips: [b, a] };
  const render = () => hooks.render(() => useHomeTripSelection(props));
  const first = render();
  assert.equal(first.featuredDriverUpcomingTrip, a);
  props.hiddenHomePriorities = { [keys.upcomingTrip(a)]: true };
  const next = render();
  assert.equal(next.featuredDriverUpcomingTrip, b);
  assert.equal(next.latestTrips, first.latestTrips);
  assert.equal(next.homeMapTrips, first.homeMapTrips);
  props.ongoingDriverTrip = { ...a, status: 'ongoing' };
  assert.equal(render().activeHomeTrip, props.ongoingDriverTrip);
  assert.equal(render().featuredDriverUpcomingTrip, null);
  assert.deepEqual(render().homeMapTrips, [props.ongoingDriverTrip]);
  hooks.unmount();
});

test('hiding a pending reservation moves to the next booking, without accepting or cancelling anything', () => {
  const hooks = hookHarness();
  const { useHomeTripSelection } = loader({ ...native, react: hooks.react })('hooks/home/useHomeTripSelection.ts');
  const t = trip('t');
  const bookings = ['a', 'b'].map(id => Object.freeze({ id, tripId: 't', status: 'pending', updatedAt: later(id === 'a' ? 1000 : 0) }));
  const props = { remoteTrips: [], activeBookings: [], currentUser: { id: 'driver' },
    completedBookingTripIds: new Set(), bookedTripIds: new Set(), ongoingDriverTrip: null, isDriver: true,
    driverReservationHighlightTrip: t, driverReservationHighlightBookings: Object.freeze(bookings), myDriverTrips: [t] };
  const render = () => hooks.render(() => useHomeTripSelection(props));
  assert.equal(render().featuredDriverReservation.booking.id, 'a');
  props.hiddenHomePriorities = { [keys.booking(bookings[0])]: true };
  assert.equal(render().featuredDriverReservation.booking.id, 'b');
  props.hiddenHomePriorities = { ...props.hiddenHomePriorities, [keys.booking(bookings[1])]: true };
  assert.equal(render().featuredDriverReservation, null);
  assert.ok(bookings.every(booking => booking.status === 'pending'));
  hooks.unmount();
});

test('after hiding all known pending bookings, another driver trip becomes eligible for the same RTK query', () => {
  const hooks = hookHarness(), queries = [];
  const a = { ...trip('a'), passengers: [{ bookingId: 'a1', bookingStatus: 'pending' }] };
  const b = { ...trip('b', 600000), passengers: [{ bookingId: 'b1', bookingStatus: 'pending' }] };
  const { useHomeDriverActivity } = loader({ ...native, react: hooks.react,
    '@/store/api/tripApi': { useGetMyActivityTripsQuery: () => ({ data: [a, b] }), useGetTripByIdQuery: () => ({}) },
    '@/store/api/bookingApi': { useGetTripBookingsQuery: (id, options) => { queries.push({ id, options }); return {}; } },
  })('hooks/home/useHomeDriverActivity.ts');
  const props = { isDriver: true, isFocused: true, currentUser: { id: 'driver' } };
  const render = () => hooks.render(() => useHomeDriverActivity(props));
  assert.equal(render().driverReservationHighlightTrip.id, 'a');
  props.hiddenHomePriorities = { 'booking:a1': true };
  assert.equal(render().driverReservationHighlightTrip.id, 'b');
  assert.equal(queries.at(-1).id, 'b');
  props.isFocused = false; render();
  assert.equal(queries.at(-1).options.skip, true);
  hooks.unmount();
});

test('hiding the nearest request shows the next one without restarting its highlight deadline', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const hooks = hookHarness();
  const store = configureStore({ reducer: { homeRequestHighlights: highlights.default,
    auth: () => ({ user: { id: 'driver' } }) } });
  const { useHomeRequestHighlight } = loader({ ...native, react: hooks.react,
    '@/hooks/useAppIsActive': { useAppIsActive: () => true },
    '@/store/hooks': { useAppDispatch: () => store.dispatch, useAppSelector: selector => selector(store.getState()) },
  })('hooks/home/useHomeRequestHighlight.ts');
  const a = request('a'), b = request('b');
  const props = { enabled: true, userId: 'driver', requests: Object.freeze([a, b]), driverCoordinate: null };
  const render = () => hooks.render(() => useHomeRequestHighlight(props));
  render(); assert.equal(render().highlightedDriverRequest, a);
  const deadline = store.getState().homeRequestHighlights.expiresAtById.a;
  props.hiddenHomePriorities = { [keys.nearbyRequest(a)]: true };
  t.mock.timers.tick(60000);
  render(); assert.equal(render().highlightedDriverRequest, b);
  props.hiddenHomePriorities = {};
  assert.equal(render().highlightedDriverRequest, a);
  assert.equal(store.getState().homeRequestHighlights.expiresAtById.a, deadline);
  assert.deepEqual(props.requests, [a, b]);
  props.hiddenHomePriorities = { [keys.nearbyRequest(a)]: true, [keys.nearbyRequest(b)]: true };
  assert.equal(render().highlightedDriverRequest, null);
  hooks.unmount();
});

test('hiding a personal request affects only its priority, not the request feed or passenger bookings', () => {
  const hooks = hookHarness(), a = request('a'), b = request('b'), available = [request('available')];
  const { useHomePassengerActivity } = loader({ ...native, react: hooks.react,
    '@/store/api/notificationApi': { useGetNotificationsQuery: () => ({}) },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: () => ({ data: [] }) },
    '@/store/api/tripApi': { useGetTripByIdQuery: () => ({}) },
    '@/store/api/tripRequestApi': { useGetMyTripRequestsQuery: () => ({ data: [a, b] }),
      useGetAvailableTripRequestsQuery: () => ({ data: available }) },
  })('hooks/home/useHomePassengerActivity.ts');
  const props = { currentUser: { id: 'driver' }, isDriver: true, isFocused: true };
  const render = () => hooks.render(() => useHomePassengerActivity(props));
  const first = render();
  assert.equal(first.activeTripRequest, a);
  props.hiddenHomePriorities = { [keys.ownRequest(a)]: true };
  const next = render();
  assert.equal(next.activeTripRequest, b);
  assert.equal(next.availableDriverRequests, first.availableDriverRequests);
  assert.equal(a.status, 'pending');
  hooks.unmount();
});
