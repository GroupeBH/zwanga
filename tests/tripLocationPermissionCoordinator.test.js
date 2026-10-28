const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture(t) {
  const hooks = hookHarness(), calls = [];
  const env = { authenticated: true, userId: 'passenger', active: true, busy: false, pending: false,
    keyboard: false, path: '/request/new', alerts: [], version: 1, os: 'android' };
  const location = { loaded: true, loadError: false, permission: false, busy: false, settingsRequired: false,
    setConsent: value => calls.push(['consent', value]), defer: () => calls.push(['later']),
    retry: () => calls.push(['retry']), authorize: async () => calls.push(['native']), openSettings: async () => calls.push(['settings']) };
  let options;
  const load = loader({
    react: { ...hooks.react, useContext: () => ({ subscribe: () => () => {}, isBusy: () => env.busy }),
      useSyncExternalStore: (_, snapshot) => snapshot() },
    'react-native': { Platform: { get OS() { return env.os; } }, Keyboard: { isVisible: () => env.keyboard } },
    'expo-router': { usePathname: () => env.path },
    '@/store/hooks': { useAppSelector: fn => fn({ auth: { tokenPayload: { sub: env.userId } } }) },
    '@/store/selectors': { selectIsAuthenticated: () => env.authenticated },
    '@/hooks/useAppIsActive': { useAppIsActive: () => env.active },
    '@/features/navigation/appEntryContext': { useAppEntryPending: () => env.pending },
    '@/features/navigation/rideOverlayContext': { RideOverlayContext: {} },
    '@/services/tokenSession': { getTokenSessionVersion: () => env.version },
    '@/services/rideAlertSession': { getRideAlertsRevision: () => env.alerts.length,
      pendingRideAlerts: () => env.alerts, subscribeRideAlerts: () => () => {} },
    '@/hooks/profile/useNearbyLocationPermission': { useNearbyLocationPermission: value => { options = value; return location; } },
    '@/components/location/BackgroundLocationApproval': { BackgroundLocationApproval: 'Approval' },
  });
  const queue = load('services/tripLocationPermission.ts');
  queue.offerTripLocationPermission('request', 'request-id', 1);
  const offer = queue.getTripLocationPermissionOffer();
  const c = load('components/TripLocationPermissionCoordinator.tsx');
  t.after(() => hooks.unmount());
  return { env, location, calls, queue, options: () => options,
    root: () => hooks.render(c.TripLocationPermissionCoordinator),
    render: () => hooks.render(() => c.TripLocationPermissionSession({ userId: env.userId, offer })) };
}

test('only a native authenticated session can display its own confirmed-operation offer', t => {
  const f = fixture(t); assert.ok(f.root());
  f.env.authenticated = false; assert.equal(f.root(), null);
  f.env.authenticated = true; f.env.os = 'web'; assert.equal(f.root(), null);
  f.env.os = 'android'; f.env.version++; assert.equal(f.root(), null);
});

test('success overlay delays the explanation; the explanation does not hide itself or start GPS', t => {
  const f = fixture(t); f.env.busy = true;
  f.render(); assert.equal(f.render().props.visible, false);
  f.env.busy = false; f.render(); assert.equal(f.render().props.visible, true);
  assert.equal(f.options().purpose, 'passenger-trip'); assert.equal(f.options().driver, false);
  assert.deepEqual(f.calls, []);
  f.env.busy = true; const modal = f.render(); assert.equal(modal.props.visible, true);
  modal.props.onConfirm(); assert.deepEqual(f.calls, [['consent', true], ['native']]);
});

test('background, incoming offers, keyboard, entry and sensitive routes defer an informational prompt', t => {
  const f = fixture(t);
  for (const [key, value] of [['active', false], ['pending', true], ['keyboard', true], ['alerts', [{}]],
    ['path', '/booking/payment/b'], ['path', '/booking/navigate/b'], ['path', '/kyc/start']]) {
    const previous = f.env[key]; f.env[key] = value;
    const modal = f.render(); assert.equal(modal.props.visible, false);
    modal.props.onConfirm(); assert.deepEqual(f.calls, []);
    f.env[key] = previous;
  }
  f.render(); assert.equal(f.render().props.visible, true);
});

test('Settings return keeps the same offer, rechecks permission and closes when granted', t => {
  const f = fixture(t); f.location.settingsRequired = true; f.render();
  f.render().props.onConfirm(); assert.deepEqual(f.calls, [['consent', true], ['settings']]);
  f.env.active = false; assert.equal(f.render().props.visible, false);
  assert.ok(f.queue.getTripLocationPermissionOffer());
  f.env.active = true; f.location.permission = true; f.render();
  assert.equal(f.queue.getTripLocationPermissionOffer(), null);
});

test('already granted OS permission consumes the offer silently; read errors expose Retry', t => {
  const f = fixture(t); f.location.permission = true; f.render();
  assert.equal(f.queue.getTripLocationPermissionOffer(), null); assert.deepEqual(f.calls, []);
  f.location.permission = false; f.location.loaded = false; f.location.loadError = true;
  f.render(); const modal = f.render(); assert.equal(modal.props.visible, true);
  modal.props.onConfirm(); assert.deepEqual(f.calls, [['retry']]);
});

test('Later dismisses without native permission or tracking; stale buttons cannot open Settings after logout', t => {
  const f = fixture(t); f.render(); const modal = f.render();
  modal.props.onClose(); assert.equal(f.queue.getTripLocationPermissionOffer(), null);
  assert.deepEqual(f.calls, [['later']]);
  f.env.version++; modal.props.onConfirm(); assert.deepEqual(f.calls, [['later']]);
});
