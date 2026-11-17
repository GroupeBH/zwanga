const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 100_000 });
  const hooks = hookHarness(), locations = new Set(), connections = new Set();
  const progress = new Set(), reads = [], notices = [];
  let requests = 0, joins = 0, leaves = 0;
  const socket = {
    joinTrip: async () => { joins++; }, leaveTrip: () => { leaves++; },
    requestPassengerLocations: async () => { requests++; },
    subscribeToConnectionState: fn => { connections.add(fn); fn(true); return () => connections.delete(fn); },
    subscribeToPassengerLocation: fn => { locations.add(fn); return () => locations.delete(fn); },
    subscribeToErrors: () => () => {},
    subscribeToBookingAutoProgress: fn => { progress.add(fn); return () => progress.delete(fn); },
  };
  const { useDriverTrackingSocket } = loader({
    react: hooks.react,
    '@/services/trackingSocket': { trackingSocket: socket },
    '../../features/driver-navigation/navigationBooking': { isFreshLivePassengerLocation: value => Date.now() - Date.parse(value.updatedAt) <= 15_000 },
    '../../features/driver-navigation/navigationMap': { isCoordinateAllowedForNavigationRoute: () => true },
  })('hooks/driver-navigation/useDriverTrackingSocket.ts');
  let positions = {};
  const props = {
    data: { isScreenActive: true, tripId: 'trip', isTripOngoing: true,
      refetchTrip: async () => reads.push('trip'), refetchBookings: async () => reads.push('bookings') },
    mapState: { isMountedRef: { current: true }, setIsSocketConnected() {},
      setLivePassengerLocations: value => { positions = typeof value === 'function' ? value(positions) : value; } },
    completion: { presentTripDestinationNotice: event => notices.push(event.type) },
    notices: { presentPassengerBoardedNotice: event => notices.push(event.type) },
    refs: { waypointsRef: { current: [{ booking: { id: 'a' } }, { booking: { id: 'b' } }] } },
  };
  const render = () => hooks.render(() => useDriverTrackingSocket(props));
  const emit = bookingId => locations.forEach(fn => fn({ tripId: 'trip', bookingId, coordinates: [15.3, -4.32], updatedAt: new Date().toISOString() }));
  t.after(() => hooks.unmount());
  const emitProgress = (type, tripId = 'trip') => progress.forEach(fn => fn({ tripId, events: [{ tripId, type, bookingId: 'a' }] }));
  return { props, render, emit, hooks, locations, emitProgress, reads, notices, requests: () => requests, joins: () => joins, leaves: () => leaves };
}

test('the real socket hook preserves notices, batches business refreshes and cancels queued reads on blur', async t => {
  const f = fixture(t); f.render(); await flush();
  for (let i = 0; i < 50; i++) f.emitProgress('driver_near_destination');
  t.mock.timers.tick(1000); await flush();
  assert.equal(f.notices.length, 50); assert.deepEqual(f.reads, []);
  f.emitProgress('pickup_confirmed', 'different-trip');
  t.mock.timers.tick(1000); await flush(); assert.deepEqual(f.reads, []);
  f.emitProgress('pickup_confirmed'); f.emitProgress('pickup_confirmed');
  t.mock.timers.tick(1000); await flush();
  assert.deepEqual(f.reads.sort(), ['bookings', 'trip']);
  assert.equal(f.notices.at(-1), 'pickup_confirmed');
  f.emitProgress('pickup_confirmed'); f.props.data.isScreenActive = false; f.render();
  t.mock.timers.tick(1000); await flush(); assert.equal(f.reads.length, 2);
});

test('driver requests missing passenger positions but does not poll over healthy realtime feeds', async t => {
  const env = fixture(t);
  env.render(); await flush();
  assert.equal(env.requests(), 1);
  for (let i = 0; i < 20; i++) {
    env.emit('a'); env.emit('b');
    t.mock.timers.tick(10_000); await flush();
  }
  assert.equal(env.requests(), 1);
  env.emit('a'); // One fresh passenger must not hide a different passenger's stale position.
  t.mock.timers.tick(10_000); await flush();
  assert.equal(env.requests(), 2);
  env.props.refs.waypointsRef.current = [];
  t.mock.timers.tick(10_000); await flush();
  assert.equal(env.requests(), 2, 'completed passenger waypoints do not keep polling alive');
});

test('missing passenger GPS backs off instead of requesting every ten seconds for a long ride', async t => {
  const env = fixture(t);
  env.render(); await flush();
  for (let i = 0; i < 60; i++) {
    t.mock.timers.tick(10_000); await flush();
  }
  assert.ok(env.requests() <= 14, `unexpected ${env.requests()} passenger-location requests in ten minutes`);
  env.emit('a'); env.emit('b');
  const healthyRequests = env.requests();
  t.mock.timers.tick(10_000); await flush();
  assert.equal(env.requests(), healthyRequests, 'healthy positions should not request a snapshot');
  env.props.refs.waypointsRef.current = [{ booking: { id: 'new-passenger' } }];
  t.mock.timers.tick(10_000); await flush();
  assert.equal(env.requests(), healthyRequests + 1, 'a new passenger resets the backoff');
});

test('driver UI releases the socket room and timer in the background and rejoins on return', async t => {
  const env = fixture(t);
  env.render(); await flush();
  env.props.data.isScreenActive = false;
  env.render();
  t.mock.timers.tick(120_000); await flush();
  assert.equal(env.requests(), 1);
  assert.equal(env.locations.size, 0);
  assert.equal(env.leaves(), 1);
  env.props.data.isScreenActive = true;
  env.render(); await flush();
  assert.equal(env.joins(), 2);
  assert.equal(env.requests(), 2);
  env.hooks.unmount();
  assert.equal(env.locations.size, 0);
});

test('refreshing booking callbacks for an hour does not recreate the tracking subscription', async t => {
  const env = fixture(t); env.render(); await flush();
  for (let i = 0; i < 180; i++) {
    env.props.data = { ...env.props.data, refetchBookings() {}, refetchTrip() {}, showDialog() {} };
    env.props.notices = { getPassengerNameForBooking: () => 'Updated passenger', presentPassengerBoardedNotice() {} };
    env.props.completion = { presentTripDestinationNotice() {} };
    env.render();
  }
  assert.equal(env.joins(), 1); assert.equal(env.leaves(), 0); assert.equal(env.requests(), 1); assert.equal(env.locations.size, 1);
});
