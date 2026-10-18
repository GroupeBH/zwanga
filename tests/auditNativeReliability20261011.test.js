const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function encode(points) {
  let lat = 0, lng = 0, result = '';
  for (const [latitude, longitude] of points) {
    const nextLat = Math.round(latitude * 1e5), nextLng = Math.round(longitude * 1e5);
    for (let delta of [nextLat - lat, nextLng - lng]) {
      delta = delta < 0 ? ~(delta << 1) : delta << 1;
      while (delta >= 32) { result += String.fromCharCode((32 | (delta & 31)) + 63); delta >>>= 5; }
      result += String.fromCharCode(delta + 63);
    }
    lat = nextLat; lng = nextLng;
  }
  return result;
}
for (const os of ['ios', 'android']) test(`${os}: both navigation decoders bound routes, preserve endpoints and reject invalid data`, () => {
  const load = loader({ 'react-native': { Platform: { OS: os } }, 'react-native-maps': { PROVIDER_GOOGLE: 'google' } });
  const passenger = load('features/passenger-navigation/navigationModel.ts');
  const driver = load('hooks/driver-navigation/useDriverRouteFormatting.ts').useDriverRouteFormatting();
  const points = Array.from({ length: 1200 }, (_, i) => [-4.3 + i / 100000, 15.3]);
  for (const [decode, cap] of [[driver.decodePolyline, 200], [passenger.decodePolyline, os === 'ios' ? 180 : 250]]) {
    const result = decode(encode(points));
    assert.equal(result.length, cap);
    assert.deepEqual(result[0], { latitude: -4.3, longitude: 15.3 });
    assert.deepEqual(result.at(-1), { latitude: -4.28801, longitude: 15.3 });
    for (const invalid of ['', '_', encode(points) + '_', '?'.repeat(100001), '\u0000', encode([[100, 200], [100, 200]])]) {
      assert.deepEqual(decode(invalid), []);
    }
    assert.deepEqual(decode(encode([[48, 2], [48.1, 2.1]])), [], 'regional validation remains enforced');
    assert.equal(decode(encode(points.slice(0, 2))).length, 2);
    assert.deepEqual(decode(encode([[15.3, -4.3], [15.31, -4.31]])),
      [{ latitude: -4.3, longitude: 15.3 }, { latitude: -4.31, longitude: 15.31 }],
      'legacy swapped coordinates are still normalized before drawing');
  }
});

test('latest GPS sample is selected without sorting or mutating the native batch', () => {
  const { latestLocation } = loader()('services/background/latestLocation.ts');
  const first = { timestamp: 4 }, equal = { timestamp: 4 };
  const batch = Object.freeze([{ timestamp: 1 }, first, { timestamp: NaN }, { timestamp: Infinity }, equal]);
  assert.equal(latestLocation(batch), first);
  assert.equal(latestLocation(undefined), null);
  assert.equal(latestLocation([{ timestamp: NaN }]), null);
});

test('release error boundary remounts the UI without calling developer-only reload', () => {
  let reloads = 0;
  const { AppErrorBoundary } = loader({
    'react-native': { DevSettings: { reload: () => reloads++ }, StyleSheet: { create: value => value } },
    '@/services/analytics': { trackEvent() {} }, '@/services/diagnostics': { reportUnexpectedError() {} },
  })('components/AppErrorBoundary.tsx');
  const boundary = new AppErrorBoundary({ children: 'content' });
  boundary.state.error = new Error('test');
  boundary.setState = update => { boundary.state = { ...boundary.state, ...update(boundary.state) }; };
  boundary.reload();
  assert.equal(reloads, 0); assert.equal(boundary.state.error, null); assert.equal(boundary.state.retryKey, 1);
  assert.equal(boundary.render().props.children, 'content');
});

test('trip editor switches overlay panels synchronously without delayed reopening after close', () => {
  const hooks = hookHarness(), state = {};
  const { useTripEditorNavigation } = loader({ react: hooks.react, 'react-native': { Keyboard: { dismiss() {} } },
    '../../features/trips/tripsModel': {} })('hooks/trips/useTripEditorNavigation.ts');
  const params = new Proxy({}, { get: (_target, key) => key.startsWith('set') ? value => { state[key] = value; } : undefined });
  const editor = hooks.render(() => useTripEditorNavigation(params));
  editor.openEditRoutePicker('departure');
  assert.equal(state.setEditModalSuspended, true); assert.equal(state.setEditRoutePickerTarget, 'departure');
  editor.restoreEditModalAfterPicker();
  assert.equal(state.setEditModalSuspended, false); assert.equal(state.setEditRoutePickerTarget, null);
  editor.openEditRoutePicker('arrival'); editor.closeEditModal();
  assert.equal(state.setEditingTrip, null); assert.equal(state.setEditModalSuspended, false);
  assert.equal(state.setEditRoutePickerTarget, null); hooks.unmount();
  assert(!fs.readFileSync('hooks/trips/useTripEditorNavigation.ts', 'utf8').includes('setTimeout'));
});

test('profile and trip forms are mounted inside focus-aware overlay scopes', () => {
  for (const route of ['profile', 'trips']) {
    const source = fs.readFileSync(`app/(tabs)/${route}.tsx`, 'utf8');
    assert.match(source, /<RideOverlayScope scopeKey=/);
    assert.match(source, /active=\{focused\}/);
    assert.match(source, /function (Profile|Trips)Content\(\)/);
  }
});
