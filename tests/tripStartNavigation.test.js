const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createApi } = require('@reduxjs/toolkit/query');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const started = { id: 'trip', status: 'ongoing', price: 2500, availableSeats: 2,
  departure: { name: 'Gombe', lat: -4.3, lng: 15.3 }, arrival: { name: 'Lemba', lat: -4.4, lng: 15.3 } };
const request = { id: 'request', status: 'pending', departureDateMax: '2099-01-01T11:00:00Z' };
const noop = () => {};
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function fixture(t, kind = 'request', platform = 'android') {
  const hooks = hookHarness();
  const calls = [], dialogs = [], routes = [], feedback = [];
  const state = { active: true, reads: 0, refreshes: 0, start: async () => started,
    accept: async () => ({ trip: { ...started, status: 'upcoming' } }),
    requestStart: async () => ({ trip: started }) };
  const api = createApi({
    reducerPath: 'startTestApi', baseQuery: async () => { state.reads++; return { data: started }; },
    endpoints: builder => ({ getTripById: builder.query({ query: id => `/trips/${id}` }) }),
  });
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer },
    middleware: defaults => defaults().concat(api.middleware) });
  t.after(() => { hooks.unmount(); store.dispatch(api.util.resetApiState()); });
  const load = loader({
    react: { ...React, ...hooks.react },
    'react-native': { Platform: { OS: platform }, StyleSheet: { create: x => x } },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/store/hooks': { useAppDispatch: () => store.dispatch },
    '@/store/api/tripApi': { tripApi: api },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/utils/errorHelpers': {
      getApiErrorMessage: (_error, fallback) => fallback,
      isDailyPublicationLimitError: () => false, isDriverRequiredError: () => false,
      isPassengerKycRequiredError: () => false,
    },
  });
  const props = {
    trip: { ...started, status: 'upcoming' }, tripRequest: request, id: request.id,
    router: { replace: route => routes.push(route), push: route => routes.push(route) },
    showDialog: dialog => dialogs.push(dialog), showFeedback: (...args) => feedback.push(args),
    refetch: () => { state.refreshes++; throw new Error('Extra reads must not delay navigation'); },
    refreshAll: () => { state.refreshes++; throw new Error('Extra reads must not delay navigation'); },
    reconcileTripStatus: async () => null,
    startTrip: id => { calls.push(['start', id]); return { unwrap: () => state.start() }; },
    acceptTripRequest: payload => { calls.push(['accept', payload]); return { unwrap: () => state.accept() }; },
    startTripFromRequest: id => { calls.push(['request-start', id]); return { unwrap: () => state.requestStart() }; },
    directAcceptDepartureDate: new Date('2099-01-01T10:00:00Z'), canAcceptRequest: true,
    showDirectAcceptModal: false, setShowDirectAcceptModal: value => { props.showDirectAcceptModal = value; },
    compatibleActiveVehicles: [{ id: 'selected', isActive: true }], requestedVehicleType: 'car',
    directAcceptVehicle: { id: 'selected' }, directAcceptRequiresPassengerKyc: false,
    directAcceptDepartureLocation: null, directAcceptArrivalLocation: null,
    directAcceptDepartureReference: '', directAcceptArrivalReference: '', setAreDirectOptionsExpanded: noop,
  };
  const actionHook = kind === 'request'
    ? load('hooks/request-detail/useRequestDriverActions.ts').useRequestDriverActions
    : load('hooks/manage-trip/useManageTripActions.ts').useManageTripActions;
  return { state, props, hooks, calls, dialogs, routes, feedback,
    render: () => hooks.render(() => actionHook(props)),
    cached: () => api.endpoints.getTripById.select(started.id)(store.getState()).data,
  };
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: accept and start opens guidance after the acceptance modal closes, without another dialog or read`, async t => {
    const app = fixture(t, 'request', platform);
    app.props.showDirectAcceptModal = true;
    await app.render().handleDirectAcceptTripRequest(true);
    assert.deepEqual(app.routes, []);
    const view = app.render();
    if (platform === 'ios') {
      assert.deepEqual(app.routes, [], 'wait for the native dismissal, not a guessed timer');
      await view.handleDirectAcceptTripRequest(true);
      assert.equal(app.calls.length, 2, 'no second acceptance during the dismissal');
      view.onDirectAcceptModalDismiss();
      view.onDirectAcceptModalDismiss();
    }
    assert.deepEqual(app.routes, ['/trip/navigate/trip']);
    assert.deepEqual(app.calls.map(call => call[0]), ['accept', 'start']);
    assert.equal(app.calls[0][1].payload.vehicleId, 'selected');
    assert.deepEqual(app.cached(), started, 'cache uses the started trip, not the upcoming acceptance result');
    assert.equal(app.dialogs.length, 0);
    assert.equal(app.state.reads, 0);
    assert.equal(app.state.refreshes, 0);
  });
}

test('iOS also navigates when the modal was dismissed before the start response arrived', async t => {
  const app = fixture(t, 'request', 'ios'), pending = deferred();
  app.props.showDirectAcceptModal = true;
  app.state.start = () => pending.promise;
  const operation = app.render().handleDirectAcceptTripRequest(true);
  await Promise.resolve(); await Promise.resolve();
  app.render().onDirectAcceptModalDismiss();
  assert.equal(app.routes.length, 0);
  pending.resolve(started); await operation;
  assert.deepEqual(app.routes, ['/trip/navigate/trip']);
});

for (const kind of ['request', 'manage']) {
  test(`${kind}: confirming start goes directly to guidance and duplicate confirmation does not repeat the mutation`, async t => {
    const app = fixture(t, kind), pending = deferred();
    app.state.start = () => pending.promise;
    app.state.requestStart = async () => ({ trip: await pending.promise });
    const view = app.render();
    await (kind === 'request' ? view.handleStartTripFromRequest() : view.handleStartTrip());
    assert.equal(app.calls.length, 0, 'opening or cancelling the confirmation does not start the trip');
    const confirm = app.dialogs[0].actions[1].onPress;
    const operation = confirm(); await confirm();
    assert.equal(app.calls.length, 1);
    assert.equal(app.routes.length, 0);
    pending.resolve(started); await operation; await confirm();
    assert.deepEqual(app.routes, ['/trip/navigate/trip']);
    assert.equal(app.dialogs.length, 1, 'no success dialog');
    assert.deepEqual(app.feedback, []);
    assert.deepEqual(app.cached(), started);
    assert.equal(app.state.refreshes, 0);
  });
}

test('a reconciled server-confirmed start also navigates after an ambiguous transport error, without resending start', async t => {
  const app = fixture(t, 'manage');
  app.state.start = async () => { throw new Error('timeout'); };
  app.props.reconcileTripStatus = async (_error, statuses) => {
    assert.deepEqual(statuses, ['ongoing']); return started;
  };
  await app.render().handleStartTrip();
  await app.dialogs[0].actions[1].onPress();
  assert.deepEqual(app.routes, ['/trip/navigate/trip']);
  assert.equal(app.calls.length, 1);
});

for (const kind of ['request', 'manage']) {
  test(`${kind}: start failure stays on the current screen, reports an error and allows retry`, async t => {
    const app = fixture(t, kind);
    app.state.start = app.state.requestStart = async () => { throw new Error('offline'); };
    const view = app.render();
    await (kind === 'request' ? view.handleStartTripFromRequest() : view.handleStartTrip());
    const confirm = app.dialogs[0].actions[1].onPress;
    await confirm();
    assert.deepEqual(app.routes, []);
    assert.equal(app.cached(), undefined);
    if (kind === 'manage') assert.equal(app.feedback[0][0], 'error');
    else assert.equal(app.dialogs.at(-1).variant, 'danger');
    app.state.start = async () => started;
    app.state.requestStart = async () => ({ trip: started });
    await confirm();
    assert.deepEqual(app.routes, ['/trip/navigate/trip']);
  });
}

test('a failed acceptance cannot start a trip or open navigation', async t => {
  const app = fixture(t);
  app.state.accept = async () => { throw new Error('refused'); };
  await app.render().handleDirectAcceptTripRequest(true);
  assert.deepEqual(app.calls.map(call => call[0]), ['accept']);
  assert.deepEqual(app.routes, []);
  assert.equal(app.cached(), undefined);
  assert.equal(app.dialogs.at(-1).variant, 'danger');
});

test('iOS dismissal after leaving the screen cannot open a queued navigation', async t => {
  const app = fixture(t, 'request', 'ios');
  app.props.showDirectAcceptModal = true;
  await app.render().handleDirectAcceptTripRequest(true);
  const view = app.render();
  app.state.active = false;
  app.render();
  view.onDirectAcceptModalDismiss();
  assert.deepEqual(app.routes, []);
  assert.equal(app.cached(), undefined);
});

test('two rapid accept-and-start taps send only one acceptance and one start', async t => {
  const app = fixture(t), pending = deferred();
  app.state.accept = () => pending.promise;
  const view = app.render();
  const first = view.handleDirectAcceptTripRequest(true);
  await view.handleDirectAcceptTripRequest(true);
  assert.deepEqual(app.calls.map(call => call[0]), ['accept']);
  pending.resolve({ trip: { ...started, status: 'upcoming' } });
  await first;
  assert.deepEqual(app.calls.map(call => call[0]), ['accept', 'start']);
  assert.deepEqual(app.routes, ['/trip/navigate/trip']);
});

for (const change of ['unmount', 'blur', 'different-trip']) {
  test(`a late start response after ${change} cannot redirect another screen or seed its cache`, async t => {
    const app = fixture(t, 'manage'), pending = deferred();
    app.state.start = () => pending.promise;
    await app.render().handleStartTrip();
    const operation = app.dialogs[0].actions[1].onPress();
    if (change === 'unmount') app.hooks.unmount();
    if (change === 'blur') { app.state.active = false; app.render(); }
    if (change === 'different-trip') { app.props.trip = { ...started, id: 'other' }; app.render(); }
    pending.resolve(started); await operation;
    assert.deepEqual(app.routes, []);
    assert.equal(app.cached(), undefined);
  });
}
