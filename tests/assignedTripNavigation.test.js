const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { getAssignedPassengerTripId, hasAssignedTripStarted } = loader()('features/trip-request/assignedTripNavigation.ts');

const request = { id: 'request', passengerId: 'passenger', selectedDriverId: 'driver', tripId: 'trip', status: 'driver_selected' };
const trip = { id: 'trip', status: 'upcoming', startedAt: null };

test('only the owner can follow a request’s trip, including after request expiry', () => {
  assert.equal(getAssignedPassengerTripId('request', request, 'passenger'), 'trip');
  assert.equal(getAssignedPassengerTripId('request', { ...request, status: 'expired' }, 'passenger'), 'trip');
  assert.equal(getAssignedPassengerTripId('request', request, 'driver'), null);
  assert.equal(getAssignedPassengerTripId('other', request, 'passenger'), null);
  assert.equal(getAssignedPassengerTripId('request', request, undefined), null);
  assert.equal(getAssignedPassengerTripId('request', { ...request, tripId: null }, 'passenger'), null);
});

test('temporary request errors retain the trip link, but permission/not-found errors do not', () => {
  for (const status of ['FETCH_ERROR', 'TIMEOUT_ERROR', 503, 500, 429]) {
    assert.equal(getAssignedPassengerTripId('request', request, 'passenger', { status }), 'trip');
  }
  for (const error of [{ status: 401 }, { status: 403 }, { status: 404 }, { status: 'PARSING_ERROR', originalStatus: 403 }, { status: 400 }, { message: 'unknown error' }]) {
    assert.equal(getAssignedPassengerTripId('request', request, 'passenger', error), null);
  }
});

test('started, completed and interrupted trips open directly; upcoming requests stay editable', () => {
  assert.equal(hasAssignedTripStarted('trip', trip), false);
  assert.equal(hasAssignedTripStarted('trip', { ...trip, status: 'ongoing' }), true);
  assert.equal(hasAssignedTripStarted('trip', { ...trip, status: 'completed' }), true);
  assert.equal(hasAssignedTripStarted('trip', { ...trip, status: 'cancelled' }), false);
  assert.equal(hasAssignedTripStarted('trip', { ...trip, startedAt: '2026-09-13T10:00:00Z' }), true);
  assert.equal(hasAssignedTripStarted('trip', { ...trip, interruptionRequest: { status: 'pending' } }), true);
  assert.equal(hasAssignedTripStarted('different', { ...trip, status: 'ongoing' }), false);
});

function setup(platform = 'ios') {
  const hooks = hookHarness(), routes = [];
  const props = { requestId: 'request', tripRequest: request, assignedTrip: trip, userId: 'passenger', isScreenActive: true, router: { replace: href => routes.push(href) } };
  const { useAssignedTripNavigation } = loader({ react: hooks.react, 'react-native': { Platform: { OS: platform } } })('hooks/useAssignedTripNavigation.ts');
  return { hooks, routes, props, render: () => hooks.render(() => useAssignedTripNavigation(props)) };
}

test('a request follows the start via existing query data and replaces the screen only once', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = setup();
  assert.equal(app.render().isOpeningAssignedTrip, false);
  app.props.assignedTrip = { ...trip, status: 'ongoing' };
  assert.equal(app.render().isOpeningAssignedTrip, true);
  t.mock.timers.tick(259);
  assert.deepEqual(app.routes, []);
  t.mock.timers.tick(1);
  assert.deepEqual(app.routes, ['/trip/trip']);
  app.props.assignedTrip = { ...app.props.assignedTrip };
  app.render();
  t.mock.timers.tick(1000);
  assert.equal(app.routes.length, 1);
  app.hooks.unmount();
});

test('blur, unmount and account changes cancel pending navigation', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const change of ['blur', 'unmount', 'account', 'request']) {
    const app = setup();
    app.props.assignedTrip = { ...trip, status: 'ongoing' };
    app.render();
    if (change === 'blur') app.props.isScreenActive = false;
    if (change === 'account') app.props.userId = 'someone-else';
    if (change === 'request') app.props.requestId = 'different';
    if (change === 'unmount') app.hooks.unmount(); else app.render();
    t.mock.timers.tick(500);
    assert.deepEqual(app.routes, [], change);
    app.hooks.unmount();
  }
});

test('background data does not navigate; focus opens an already interrupted trip on Android', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = setup('android');
  app.props.isScreenActive = false;
  app.props.assignedTrip = { ...trip, status: 'completed', interruptionRequest: { status: 'completed' } };
  app.render(); t.mock.timers.tick(1000);
  assert.deepEqual(app.routes, []);
  app.props.isScreenActive = true;
  assert.equal(app.render().isOpeningAssignedTrip, true);
  t.mock.timers.tick(40);
  assert.deepEqual(app.routes, ['/trip/trip']);
  app.hooks.unmount();
});

test('a failed navigation leaves the trip button usable instead of an endless spinner', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = setup();
  app.props.assignedTrip = { ...trip, status: 'ongoing' };
  app.props.router.replace = () => { throw new Error('Navigation not ready'); };
  app.render(); t.mock.timers.tick(260);
  const result = app.render();
  assert.equal(result.isOpeningAssignedTrip, false);
  assert.equal(result.passengerTripId, 'trip');
  app.hooks.unmount();
});
