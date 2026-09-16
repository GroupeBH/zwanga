const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 100_000 });
  const hooks = hookHarness(), locations = new Set(), connections = new Set();
  let requests = 0, joins = 0, leaves = 0;
  const socket = {
    joinTrip: async () => { joins++; }, leaveTrip: () => { leaves++; },
    requestPassengerLocations: async () => { requests++; },
    subscribeToConnectionState: fn => { connections.add(fn); fn(true); return () => connections.delete(fn); },
    subscribeToPassengerLocation: fn => { locations.add(fn); return () => locations.delete(fn); },
    subscribeToErrors: () => () => {}, subscribeToBookingAutoProgress: () => () => {},
  };
  const { useDriverTrackingSocket } = loader({
    react: hooks.react,
    '@/services/trackingSocket': { trackingSocket: socket },
    '../../features/driver-navigation/navigationBooking': { isFreshLivePassengerLocation: value => Date.now() - Date.parse(value.updatedAt) <= 15_000 },
    '../../features/driver-navigation/navigationMap': { isCoordinateAllowedForNavigationRoute: () => true },
  })('hooks/driver-navigation/useDriverTrackingSocket.ts');
  let positions = {};
  const props = {
    data: { isScreenActive: true, tripId: 'trip', isTripOngoing: true },
    mapState: { isMountedRef: { current: true }, setIsSocketConnected() {},
      setLivePassengerLocations: value => { positions = typeof value === 'function' ? value(positions) : value; } },
    completion: {}, notices: {}, refs: { waypointsRef: { current: [{ booking: { id: 'a' } }, { booking: { id: 'b' } }] } },
  };
  const render = () => hooks.render(() => useDriverTrackingSocket(props));
  const emit = bookingId => locations.forEach(fn => fn({ tripId: 'trip', bookingId, coordinates: [15.3, -4.32], updatedAt: new Date().toISOString() }));
  t.after(() => hooks.unmount());
  return { props, render, emit, hooks, locations, requests: () => requests, joins: () => joins, leaves: () => leaves };
}

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
