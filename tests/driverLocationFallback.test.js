const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 100_000 });
  const hooks = hookHarness();
  const connections = new Set(), locations = new Set(), queries = [];
  let connected = true;
  const load = loader({
    react: hooks.react,
    '@/services/trackingSocket': { trackingSocket: {
      subscribeToConnectionState: fn => { connections.add(fn); fn(connected); return () => connections.delete(fn); },
      subscribeToDriverLocation: fn => { locations.add(fn); return () => locations.delete(fn); },
    } },
    '@/store/api/tripApi': { useGetDriverLocationQuery: (id, options) => { queries.push({ id, ...options }); return {}; } },
  });
  const { useDriverLocationFallback } = load('hooks/passenger-navigation/useDriverLocationFallback.ts');
  const props = { tripId: 'trip', enabled: true };
  const render = () => { hooks.render(() => useDriverLocationFallback(props.tripId, props.enabled)); return queries.at(-1); };
  const emit = (extra = {}) => locations.forEach(fn => fn({ tripId: props.tripId, coordinates: [15.3, -4.32], updatedAt: new Date().toISOString(), ...extra }));
  t.after(() => hooks.unmount());
  return { render, emit, props, hooks, connections, locations, connect(value) { connected = value; connections.forEach(fn => fn(value)); } };
}

test('HTTP bootstraps the position, then stays disabled while fresh socket positions arrive', t => {
  const env = fixture(t);
  assert.equal(env.render().skip, false);
  env.emit();
  assert.equal(env.render().skip, true);
  for (let i = 0; i < 360; i++) {
    t.mock.timers.tick(5000);
    env.emit();
    assert.equal(env.render().pollingInterval, 0);
  }
  assert.equal(env.locations.size, 1, 'no subscription churn during a long ride');
});

test('disconnects and silent-but-connected sockets restore HTTP polling, fresh positions disable it again', t => {
  const env = fixture(t);
  env.render(); env.emit();
  assert.equal(env.render().skip, true);
  env.connect(false);
  assert.equal(env.render().pollingInterval, 10_000);
  env.connect(true);
  assert.equal(env.render().skip, false, 'a connection without positions is not healthy');
  env.emit();
  assert.equal(env.render().skip, true);
  t.mock.timers.tick(15_000);
  assert.equal(env.render().skip, false);
  env.emit();
  assert.equal(env.render().skip, true);
});

test('stale, malformed and other-trip snapshots do not disable the HTTP rescue', t => {
  const env = fixture(t);
  env.render();
  for (const extra of [{ tripId: 'other' }, { coordinates: [NaN, -4] }, { updatedAt: null },
    { updatedAt: new Date(80_000).toISOString() }, { updatedAt: new Date(200_000).toISOString() }]) {
    env.emit(extra);
    assert.equal(env.render().skip, false);
  }
});

test('blur/background, changing trips and unmount stop polling and dispose realtime listeners', t => {
  const env = fixture(t);
  env.render(); env.emit(); env.render();
  env.props.enabled = false;
  assert.equal(env.render().pollingInterval, 0);
  assert.equal(env.locations.size, 0);
  assert.equal(env.connections.size, 0);
  t.mock.timers.tick(60_000);
  env.props.tripId = 'next'; env.props.enabled = true;
  assert.equal(env.render().skip, false);
  env.emit({ tripId: 'trip' });
  assert.equal(env.render().skip, false);
  env.emit(); assert.equal(env.render().skip, true);
  env.hooks.unmount();
  assert.equal(env.locations.size, 0);
  assert.equal(env.connections.size, 0);
});
