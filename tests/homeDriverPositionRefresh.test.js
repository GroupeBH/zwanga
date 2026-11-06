const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const fix = (age = 0) => ({ timestamp: Date.now() - age, coords: { latitude: -4.3, longitude: 15.3, accuracy: 15 } });
const nodes = node => Array.isArray(node) ? node.flatMap(nodes)
  : React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
const content = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(content).join('')
  : React.isValidElement(node) ? content(node.props.children) : '';

function fixture(t) {
  const hooks = hookHarness();
  const options = { active: true, version: 0, enabled: true, permission: true, gps: true,
    ride: null, isError: false, position: fix(), readDelay: null, gpsDelay: null, sendDelay: null, failure: null };
  const state = { auth: { user: { id: 'driver' } }, zwangaApi: { config: { online: true } } };
  let data = { enabled: true, automatic: true, available: true, pendingOfferId: null,
    presence: { discoveryEnabled: true, updatedAt: new Date(Date.now() - 3_600_000).toISOString() } };
  const calls = { sends: [], gps: [], resets: 0, settings: 0, reads: 0 };
  const listeners = new Set();
  const appState = { currentState: 'active', addEventListener: (_event, fn) => {
    listeners.add(fn); return { remove: () => listeners.delete(fn) };
  } };
  const nearby = { isNearbyDriverLocationEnabled: async () => options.enabled,
    hasActiveRideLocationSession: async () => Boolean(options.ride) };
  const api = { useDriverDispatchStatusQuery: () => ({ data, isError: options.isError }),
    driverDispatchApi: { endpoints: { recordDriverPosition: { initiate: body => body } } } };
  const load = loader({
    react: { ...React, ...hooks.react },
    'react-native': { AppState: appState, Text: 'Text', View: 'View', TouchableOpacity: 'Button',
      ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/store/hooks': { useAppSelector: select => select(state) },
    '@/store/api/driverDispatchApi': api,
    '@/services/tokenSession': { getTokenSessionVersion: () => options.version },
    './tokenSession': { getTokenSessionVersion: () => options.version },
    './tokenStorage': { getTokens: async () => ({ accessToken: 'test-only' }) },
    '@/utils/jwt': { decodeJWT: () => ({ sub: state.auth.user?.id }) },
    '@/services/nearbyDriverLocation': nearby, './nearbyDriverLocation': nearby,
    './driverBackgroundLocationSession': { getActiveDriverBackgroundTripSession: async () => options.ride },
    './background/passengerTaskLifecycle': { getActiveTrackingSession: async () => null },
    'expo-location': {
      getForegroundPermissionsAsync: async () => {
        calls.reads++; if (options.readDelay) await options.readDelay;
        return { granted: options.permission };
      },
      hasServicesEnabledAsync: async () => options.gps,
    },
    '@/services/currentLocationRequest': { requestCurrentLocation: async (nearby, signal, policy) => {
      calls.gps.push({ nearby, signal, policy }); if (options.gpsDelay) await options.gpsDelay;
      return options.position;
    } },
    '@/store': { store: { dispatch: body => {
      calls.sends.push(body); const version = options.version;
      return { unwrap: async () => {
        if (options.sendDelay) await options.sendDelay;
        if (options.failure) throw options.failure;
        if (options.version === version) data = { ...data, presence: { ...data.presence, updatedAt: body.recordedAt } };
        return data;
      }, reset: () => { calls.resets++; } };
    } } },
  });
  const Component = load('components/home/HomeDriverStatus.tsx').HomeDriverStatus.type;
  const render = () => hooks.render(() => Component({ active: options.active, onPress: () => { calls.settings++; } }));
  t.after(() => hooks.unmount());
  return { options, state, calls, hooks, render, load,
    setData: patch => { data = { ...data, ...patch }; },
    app: value => { appState.currentState = value; for (const fn of listeners) fn(value); },
  };
}

test('stale Home status uploads a fresh position and waits for the backend acknowledgement', async t => {
  const f = fixture(t); const pending = deferred(); f.options.sendDelay = pending.promise;
  const view = f.render();
  assert.match(content(view), /Position ancienne.*Touchez pour actualiser/);
  assert.match(view.props.accessibilityHint, /Envoyer votre position/);
  const work = view.props.onPress(); await tick();
  const sending = f.render();
  assert.equal(sending.props.disabled, true);
  assert.equal(sending.props.accessibilityState.busy, true);
  assert.equal(nodes(sending).some(n => n.type === 'Spinner'), true);
  assert.match(content(sending), /Envoi de votre position/);
  assert.doesNotMatch(content(sending), /Position envoyée/);
  assert.equal(f.calls.settings, 0); assert.equal(f.calls.sends.length, 1);
  assert.deepEqual(f.calls.gps[0].policy, { maxAge: 15000, requiredAccuracy: 250, fallback: false });
  assert.deepEqual(f.calls.sends[0], { latitude: -4.3, longitude: 15.3, accuracy: 15,
    recordedAt: new Date(f.options.position.timestamp).toISOString() });
  pending.resolve(); await work;
  assert.match(content(f.render()), /Position envoyée/);
  assert.equal(f.calls.resets, 1);
});

test('a position older than 48 hours can be refreshed from Home without opening settings', async t => {
  const f = fixture(t);
  f.setData({ presence: { discoveryEnabled: true, updatedAt: new Date(Date.now() - 48 * 3600_000).toISOString() } });
  const view = f.render();
  assert.match(content(view), /Position à actualiser.*Touchez pour recevoir de nouvelles commandes/);
  await view.props.onPress();
  assert.equal(f.calls.sends.length, 1); assert.equal(f.calls.settings, 0);
  assert.match(content(f.render()), /Position envoyée/);
});

test('success feedback expires, returning to the server status without another location read', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 4_000_000 });
  const f = fixture(t); await f.render().props.onPress(); f.render();
  t.mock.timers.tick(5000);
  assert.match(content(f.render()), /Commandes possibles/);
  assert.equal(f.calls.gps.length, 1);
});

test('double tap shares a single GPS/send operation', async t => {
  const f = fixture(t); const pending = deferred(); f.options.gpsDelay = pending.promise;
  const action = f.render().props.onPress;
  const first = action(); await action(); await tick();
  assert.equal(f.calls.gps.length, 1); pending.resolve(); await first;
  assert.equal(f.calls.sends.length, 1);
});

test('a recent status and unavailable/disabled/error/offline states retain the settings action', t => {
  const f = fixture(t);
  f.setData({ presence: { discoveryEnabled: true, updatedAt: new Date().toISOString() } });
  f.render().props.onPress();
  f.setData({ available: false }); f.render().props.onPress();
  f.setData({ available: true, presence: { discoveryEnabled: false } }); f.render().props.onPress();
  f.options.isError = true; f.render().props.onPress();
  f.state.zwangaApi.config.online = false; f.render().props.onPress();
  assert.equal(f.calls.settings, 5); assert.equal(f.calls.reads, 0); assert.equal(f.calls.sends.length, 0);
});

for (const [option, text] of [['permission', /Localisation non autorisée/], ['enabled', /Partage de position désactivé/]]) {
  test(`missing ${option} leaves discovery unchanged and offers the existing permission screen`, async t => {
    const f = fixture(t); f.options[option] = false;
    await f.render().props.onPress(); const view = f.render(); assert.match(content(view), text);
    view.props.onPress(); assert.equal(f.calls.settings, 1);
    assert.equal(f.calls.gps.length, 0); assert.equal(f.calls.sends.length, 0);
  });
}

test('disabled GPS has an actionable failure rather than a false success', async t => {
  const f = fixture(t); f.options.gps = false;
  await f.render().props.onPress(); assert.match(content(f.render()), /Position introuvable/);
  assert.equal(f.calls.gps.length, 0); assert.equal(f.calls.sends.length, 0);
});

test('missing, old, inaccurate, future and mocked positions are never uploaded', async t => {
  const f = fixture(t);
  const invalid = [null, fix(16000), { ...fix(), coords: { ...fix().coords, accuracy: 251 } },
    fix(-6000), { ...fix(), mocked: true }];
  for (const position of invalid) {
    f.options.position = position; await f.render().props.onPress();
    assert.match(content(f.render()), /Position introuvable/);
  }
  assert.equal(f.calls.sends.length, 0);
});

test('network failure is retryable and shares the existing delivery backoff', async t => {
  const f = fixture(t); f.options.failure = { status: 'FETCH_ERROR' };
  await f.render().props.onPress(); assert.match(content(f.render()), /Envoi non confirmé/);
  await f.render().props.onPress(); assert.match(content(f.render()), /Envoi non confirmé/);
  assert.equal(f.calls.sends.length, 1); assert.equal(f.calls.resets, 1);
});

test('the manual action does not compete with a pending automatic send', async t => {
  const f = fixture(t); const pending = deferred(); f.options.sendDelay = pending.promise;
  const sending = f.load('services/nearbyDriverPositionDelivery.ts').sendNearbyDriverPosition('driver', fix());
  await tick(); await f.render().props.onPress();
  assert.equal(f.calls.sends.length, 1); assert.doesNotMatch(content(f.render()), /Position envoyée/);
  pending.resolve(); await sending;
  assert.match(content(f.render()), /Commandes possibles/);
  assert.doesNotMatch(content(f.render()), /Envoi non confirmé/);
});

test('an old button callback cannot start GPS after unmount', async t => {
  const f = fixture(t); const action = f.render().props.onPress;
  f.hooks.unmount(); await action();
  assert.equal(f.calls.reads, 0); assert.equal(f.calls.sends.length, 0);
});

test('a stalled permission read releases the button after the bounded native deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(t); const pending = deferred(); f.options.readDelay = pending.promise;
  const work = f.render().props.onPress(); await tick();
  assert.equal(f.render().props.disabled, true);
  t.mock.timers.tick(8000); await work;
  assert.equal(f.render().props.disabled, false); assert.match(content(f.render()), /Envoi non confirmé/);
  pending.resolve(); await tick();
  assert.equal(f.calls.gps.length, 0); assert.equal(f.calls.sends.length, 0);
});

for (const change of ['inactive', 'background', 'offline', 'account', 'logout', 'unmount']) {
  test(`${change} during GPS acquisition cancels upload and stale feedback`, async t => {
    const f = fixture(t); const pending = deferred(); f.options.gpsDelay = pending.promise;
    const work = f.render().props.onPress(); await tick();
    if (change === 'inactive') f.options.active = false;
    if (change === 'background') f.app('background');
    if (change === 'offline') f.state.zwangaApi.config.online = false;
    if (change === 'account') { f.state.auth.user = { id: 'other' }; f.options.version++; }
    if (change === 'logout') f.state.auth.logoutRequestId = 'logging-out';
    if (change === 'unmount') f.hooks.unmount(); else f.render();
    assert.equal(f.calls.gps[0].signal.aborted, true);
    pending.resolve(); await work;
    assert.equal(f.calls.sends.length, 0);
    if (change !== 'unmount') assert.doesNotMatch(content(f.render()), /Position envoyée|Envoi de votre position/);
  });
}

for (const change of ['opt-out', 'ride']) {
  test(`${change} while GPS is pending is checked again by the shared delivery service`, async t => {
    const f = fixture(t); const pending = deferred(); f.options.gpsDelay = pending.promise;
    const work = f.render().props.onPress(); await tick();
    if (change === 'opt-out') f.options.enabled = false; else f.options.ride = { tripId: 'active-ride' };
    pending.resolve(); await work;
    assert.equal(f.calls.sends.length, 0); assert.doesNotMatch(content(f.render()), /Position envoyée/);
  });
}

test('a late acknowledgement after an account change never shows success on the next account', async t => {
  const f = fixture(t); const pending = deferred(); f.options.sendDelay = pending.promise;
  const work = f.render().props.onPress(); await tick();
  f.options.version++; f.state.auth.user = { id: 'other' }; f.render();
  pending.resolve(); await work;
  assert.doesNotMatch(content(f.render()), /Position envoyée/); assert.equal(f.calls.resets, 1);
});
