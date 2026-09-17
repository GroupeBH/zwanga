const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const origin = { latitude: -4.325, longitude: 15.3222 };
const request = (id, extra = {}) => ({
  id, passengerId: 'passenger', status: 'pending', selectedDriverId: null, tripId: null,
  departure: { lat: -4.325, lng: 15.3223, name: 'Départ', address: 'Départ' },
  arrival: { lat: -4.35, lng: 15.35, name: 'Arrivée', address: 'Arrivée' },
  departureDateMin: new Date(Date.now() + 3600000).toISOString(),
  departureDateMax: new Date(Date.now() + 7200000).toISOString(),
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  numberOfSeats: 1, offers: [], ...extra,
});
const nativeMocks = { 'react-native': { StyleSheet: { create: styles => styles } } };
const load = loader(nativeMocks);
const model = load('features/trip-request/requestPriority.ts');
const slice = load('store/slices/homeRequestHighlightsSlice.ts');

test('closest departure beats both an earlier departure time and a more recently published request', () => {
  const near = request('near');
  const far = request('far', { departure: { lat: -4.5, lng: 15.5 }, departureDateMin: new Date(Date.now()).toISOString() });
  const source = Object.freeze([far, near]);
  const sorted = model.rankRequestsByProximity(source, origin);
  assert.deepEqual(sorted.map(item => item.id), ['near', 'far']);
  assert.deepEqual(source.map(item => item.id), ['far', 'near']);
  assert.equal(sorted[0], near);
  assert.ok(model.getRequestDepartureDistance(near, origin) < 20);
});

test('requests with invalid or missing departure coordinates follow valid nearby requests', () => {
  const requests = [
    request('missing', { departure: null }),
    request('invalid', { departure: { lat: 0, lng: 0 } }),
    request('disabled', { departure: { lat: -4.325, lng: 15.3222, hasCoordinates: false } }),
    request('valid'),
  ];
  assert.equal(model.rankRequestsByProximity(requests, origin)[0].id, 'valid');
  for (const item of requests.slice(0, 3)) assert.equal(model.getRequestDepartureDistance(item, origin), null);
});

test('without GPS, ordering falls back to departure time with deterministic ties and invalid dates last', () => {
  const a = request('a', { departureDateMin: '2026-09-20T10:00:00Z' });
  const b = request('b', { departureDateMin: '2026-09-20T10:00:00Z' });
  const earlier = request('early', { departureDateMin: '2026-09-20T09:00:00Z' });
  const invalid = request('invalid', { departureDateMin: 'invalid' });
  for (const position of [null, { latitude: NaN, longitude: 15 }, { latitude: 0, longitude: 0 }]) {
    assert.deepEqual(model.rankRequestsByProximity([invalid, b, a, earlier], position).map(item => item.id), ['early', 'a', 'b', 'invalid']);
  }
});

test('driver movement changes the nearest request and distance labels never expose an invalid value', () => {
  const a = request('a');
  const b = request('b', { departure: { lat: -4.4, lng: 15.4 } });
  assert.equal(model.rankRequestsByProximity([a, b], origin)[0].id, 'a');
  assert.equal(model.rankRequestsByProximity([a, b], { latitude: -4.4, longitude: 15.4 })[0].id, 'b');
  assert.equal(model.formatRequestDistance(null), null);
  assert.equal(model.formatRequestDistance(NaN), null);
  assert.equal(model.formatRequestDistance(15), 'À moins de 100 m de vous');
  assert.equal(model.formatRequestDistance(1240), 'Départ à environ 1,2 km');
});

test('Home ranks the complete eligible list by driver position before applying its ten-item limit', () => {
  const hooks = hookHarness();
  const far = Array.from({ length: 12 }, (_, index) => request('far-' + index, { departure: { lat: -4.5, lng: 15.5 } }));
  const requests = [...far, request('nearest'), request('assigned', { selectedDriverId: 'other' })];
  const loadHook = loader({
    ...nativeMocks, react: hooks.react,
    '@/store/api/notificationApi': { useGetNotificationsQuery: () => ({}) },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: () => ({ data: [] }) },
    '@/store/api/tripApi': { useGetTripByIdQuery: () => ({}) },
    '@/store/api/tripRequestApi': {
      useGetMyTripRequestsQuery: () => ({ data: [] }),
      useGetAvailableTripRequestsQuery: () => ({ data: requests }),
    },
  });
  const { useHomePassengerActivity } = loadHook('hooks/home/useHomePassengerActivity.ts');
  const result = hooks.render(() => useHomePassengerActivity({ currentUser: { id: 'driver' }, isDriver: true, isFocused: true, trackedTripInfo: null, driverCoordinate: origin }));
  assert.equal(result.availableDriverRequests.length, 10);
  assert.equal(result.availableDriverRequests[0].id, 'nearest');
  assert.equal(result.availableDriverRequests.some(item => item.id === 'assigned'), false);
  hooks.unmount();
});

test('highlight state is serializable, idempotent, account-scoped and cleared on logout', () => {
  const start = (userId, requestId, now) => slice.startHomeRequestHighlight({ userId, requestId, now });
  const initial = slice.default(undefined, start('driver-a', 'a', 1000));
  assert.equal(initial.expiresAtById.a, 1000 + model.HOME_REQUEST_HIGHLIGHT_MS);
  assert.equal(slice.default(initial, start('driver-a', 'a', 5000)), initial);
  assert.deepEqual(JSON.parse(JSON.stringify(initial)), initial);
  const other = slice.default(initial, start('driver-b', 'b', 5000));
  assert.equal(other.expiresAtById.a, undefined);
  assert.equal(other.userId, 'driver-b');
  for (const type of ['auth/logout', 'auth/performLogout/fulfilled', 'auth/performLogout/rejected']) {
    assert.deepEqual(slice.default(other, { type }), { userId: null, expiresAtById: {} });
  }
});

test('highlight memory stays bounded without copying request objects into Redux', () => {
  let state;
  for (let index = 0; index < 230; index++) state = slice.default(state, slice.startHomeRequestHighlight({ userId: 'driver', requestId: String(index), now: index }));
  assert.equal(Object.keys(state.expiresAtById).length, 200);
  assert.equal(state.expiresAtById['229'], 229 + model.HOME_REQUEST_HIGHLIGHT_MS);
  assert.equal(Object.values(state.expiresAtById).every(value => typeof value === 'number'), true);
});

function highlightApp(existingStore) {
  const store = existingStore ?? configureStore({ reducer: {
    homeRequestHighlights: slice.default,
    auth: (state = { user: { id: 'driver' } }, action) => action.type === 'auth/logout' ? { user: null } : state,
  } });
  const hooks = hookHarness();
  const app = { foreground: true, expirationRenders: 0 };
  const loadHook = loader({
    ...nativeMocks, react: {
      ...hooks.react,
      useState(initial) {
        const [value, setValue] = hooks.react.useState(initial);
        return [value, next => { app.expirationRenders++; setValue(next); }];
      },
    },
    '@/hooks/useAppIsActive': { useAppIsActive: () => app.foreground },
    '@/store/hooks': { useAppDispatch: () => store.dispatch, useAppSelector: selector => selector(store.getState()) },
  });
  const { useHomeRequestHighlight } = loadHook('hooks/home/useHomeRequestHighlight.ts');
  const props = { enabled: true, userId: 'driver', requests: [request('near')], driverCoordinate: origin };
  return Object.assign(app, { hooks, store, props, render: () => hooks.render(() => useHomeRequestHighlight(props)) });
}

test('the banner expires after ten minutes, while refreshes preserve the original deadline and list', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const app = highlightApp();
  app.render();
  assert.equal(app.render().highlightedDriverRequest.id, 'near');
  const deadline = app.store.getState().homeRequestHighlights.expiresAtById.near;
  t.mock.timers.tick(5 * 60000);
  app.props.requests = [request('near', { updatedAt: new Date().toISOString() })];
  app.render();
  assert.equal(app.store.getState().homeRequestHighlights.expiresAtById.near, deadline);
  t.mock.timers.tick(5 * 60000 - 1);
  assert.equal(app.render().highlightedDriverRequest.id, 'near');
  assert.equal(app.expirationRenders, 0);
  t.mock.timers.tick(1);
  assert.equal(app.expirationRenders, 1);
  assert.equal(app.render().highlightedDriverRequest, null);
  assert.equal(app.props.requests[0].status, 'pending');
  assert.equal(app.props.requests.length, 1);
  app.hooks.unmount();
});

test('tab changes, background time and remounts do not restart a highlight', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const first = highlightApp(); first.render(); first.render();
  const deadline = first.store.getState().homeRequestHighlights.expiresAtById.near;
  first.props.enabled = false; first.render();
  t.mock.timers.tick(4 * 60000);
  first.hooks.unmount();
  const second = highlightApp(first.store); second.render();
  assert.equal(second.render().highlightedDriverRequest.id, 'near');
  assert.equal(second.store.getState().homeRequestHighlights.expiresAtById.near, deadline);
  second.foreground = false; second.render();
  t.mock.timers.tick(7 * 60000);
  second.foreground = true;
  assert.equal(second.render().highlightedDriverRequest, null);
  second.hooks.unmount();
});

test('an unseen banner does not consume its ten minutes behind another activity or in the background', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const app = highlightApp();
  app.props.enabled = false; app.render();
  assert.deepEqual(app.store.getState().homeRequestHighlights.expiresAtById, {});
  app.props.enabled = true; app.foreground = false; app.render();
  t.mock.timers.tick(20 * 60000);
  app.foreground = true; app.render();
  assert.equal(app.store.getState().homeRequestHighlights.expiresAtById.near, Date.now() + model.HOME_REQUEST_HIGHLIGHT_MS);
  app.hooks.unmount();
});

test('a new nearest request replaces the banner, but returning to the previous one keeps its deadline', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const app = highlightApp(); app.render(); app.render();
  const firstDeadline = app.store.getState().homeRequestHighlights.expiresAtById.near;
  t.mock.timers.tick(60000);
  app.props.requests = [request('closer'), request('near')]; app.render();
  assert.equal(app.render().highlightedDriverRequest.id, 'closer');
  app.props.requests = [request('near')];
  assert.equal(app.render().highlightedDriverRequest.id, 'near');
  assert.equal(app.store.getState().homeRequestHighlights.expiresAtById.near, firstDeadline);
  app.hooks.unmount();
});

test('assigned, cancelled, expired, own or removed requests cannot remain highlighted', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  for (const update of [
    { status: 'cancelled' }, { status: 'expired' }, { status: 'driver_selected' },
    { selectedDriverId: 'another' }, { tripId: 'trip' }, { offers: [{ status: 'accepted' }] },
    { passengerId: 'driver' }, { departureDateMax: '2020-01-01' },
  ]) {
    const app = highlightApp(); app.render();
    assert.equal(app.render().highlightedDriverRequest.id, 'near');
    app.props.requests = [request('near', update)];
    assert.equal(app.render().highlightedDriverRequest, null);
    app.hooks.unmount();
  }
  const app = highlightApp(); app.render(); app.render();
  app.props.requests = [];
  assert.equal(app.render().highlightedDriverRequest, null);
  app.hooks.unmount();
});

test('stale user props cannot restart the banner after logout', () => {
  const app = highlightApp(); app.render(); app.render();
  app.store.dispatch({ type: 'auth/logout' });
  assert.equal(app.render().highlightedDriverRequest, null);
  assert.deepEqual(app.store.getState().homeRequestHighlights.expiresAtById, {});
  app.hooks.unmount();
});
