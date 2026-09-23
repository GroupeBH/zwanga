const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const pickup = { latitude: -4.32, longitude: 15.30 };
const destination = { latitude: -4.38, longitude: 15.35 };
const layout = { width: 320, height: 240 };
const padding = { top: 260, bottom: 300, left: 50, right: 50 };

function setup(platform = 'ios', react = {}) {
  const load = loader({ react, 'react-native': { Platform: { OS: platform } } });
  const camera = load('utils/navigation/mapCamera.ts');
  const calls = [];
  const map = {
    fitToCoordinates: (...args) => calls.push(['fit', ...args]),
    animateToRegion: (...args) => calls.push(['region', ...args]),
    setCamera: (...args) => calls.push(['camera', ...args]),
    animateCamera: (...args) => calls.push(['animate-camera', ...args]),
  };
  return { ...camera, load, calls, map };
}

test('camera rejects missing/zero/invalid coordinates, but keeps legitimate equatorial points and numeric strings', () => {
  const env = setup();
  const { normalizeTripMapCoordinate: normalize } = env.load('utils/tripCoordinates.ts');
  for (const invalid of [null, undefined, '', ' ', false, [], {}, NaN, Infinity]) {
    assert.equal(normalize(invalid, 15), null);
    assert.equal(normalize(-4, invalid), null);
  }
  assert.deepEqual(normalize(0, 25), { latitude: 0, longitude: 25 });
  assert.deepEqual(normalize('-4.32', '15.3'), pickup);
  assert.deepEqual(env.getCameraCoordinates([null, { latitude: 0, longitude: 0 }, pickup, pickup,
    { latitude: NaN, longitude: 15 }, { latitude: 15.35, longitude: -4.38 }]), [pickup, destination]);
  assert.deepEqual(env.getNavigationCameraRegion([{ latitude: 0, longitude: 0 }]), {
    latitude: -4.441931, longitude: 15.266293, latitudeDelta: 0.1, longitudeDelta: 0.1,
  });
});

test('camera padding always leaves room on small maps and handles invalid/landscape layouts', () => {
  const env = setup();
  for (const size of [layout, { width: 200, height: 90 }, { width: 850, height: 180 }]) {
    const result = env.clampCameraPadding(padding, size);
    assert.ok(result.top + result.bottom <= size.height * 0.6 + 0.001);
    assert.ok(result.left + result.right <= size.width * 0.6 + 0.001);
    assert.ok(Math.abs(result.top / result.bottom - padding.top / padding.bottom) < 0.001);
  }
  assert.equal(env.clampCameraPadding(padding, null), null);
  assert.equal(env.clampCameraPadding(padding, { width: 0, height: 500 }), null);
  assert.equal(env.clampCameraPadding(padding, { width: 300, height: NaN }), null);
  assert.deepEqual(env.clampCameraPadding({ top: NaN, bottom: -1, left: Infinity, right: 0 }, layout),
    { top: 0, bottom: 0, left: 0, right: 0 });
});

for (const platform of ['ios', 'android']) {
  test(`${platform}: bounds are validated and iOS does not enqueue animated fits`, () => {
    const env = setup(platform);
    assert.equal(env.fitNavigationCamera(env.map, [pickup], null, { edgePadding: padding }), false);
    assert.equal(env.fitNavigationCamera(env.map, [null], layout, { edgePadding: padding }), false);
    assert.equal(env.calls.length, 0);
    assert.equal(env.fitNavigationCamera(env.map, [pickup, destination, { latitude: 0, longitude: 0 }],
      layout, { edgePadding: padding }), true);
    assert.deepEqual(env.calls[0][1], [pickup, destination]);
    assert.equal(env.calls[0][2].animated, platform === 'android');
    assert.equal(env.fitNavigationCamera(env.map, [pickup, pickup], layout,
      { edgePadding: padding, animated: false }), true);
    assert.equal(env.calls[1][0], 'region');
    assert.equal(env.calls[1][2], 0, 'single point must also respect animated:false');
  });
}

test('passenger initial framing retries when data/command is unavailable, then never follows every GPS tick', () => {
  const hooks = hookHarness();
  const env = setup('ios', hooks.react);
  const { usePassengerNavigationCamera } = env.load('hooks/passenger-navigation/usePassengerNavigationCamera.ts');
  let accepted = true;
  const props = {
    passengerLocation: null, displayedDriverLocation: null, pickupCoordinate: null, dropoffCoordinate: null,
    routeCoordinates: [], booking: { pickedUp: false }, mapLayoutRef: { current: layout },
    runMapCommand: fn => { if (accepted) fn(env.map); return accepted; },
    isMapExpanded: false, isNativeMapReady: true, hasFitInitialMapRef: { current: false },
  };
  const render = () => hooks.render(() => usePassengerNavigationCamera(props));
  render(); assert.equal(props.hasFitInitialMapRef.current, false);
  accepted = false;
  props.pickupCoordinate = pickup;
  render(); assert.equal(props.hasFitInitialMapRef.current, false);
  accepted = true;
  props.dropoffCoordinate = destination;
  let camera = render();
  assert.equal(props.hasFitInitialMapRef.current, true);
  assert.equal(env.calls.length, 1);
  assert.ok(env.calls[0][2].edgePadding.top <= 24, 'header must not be counted twice');
  for (let i = 0; i < 1000; i++) { props.passengerLocation = { ...pickup }; camera = render(); }
  assert.equal(env.calls.length, 1);
  camera.fitToRoute({ nativeEvent: {} });
  assert.equal(env.calls.length, 2);
  props.passengerLocation = { latitude: 0, longitude: 0 };
  render().centerOnPassenger(); assert.equal(env.calls.length, 2);
  props.isNativeMapReady = false; render();
  assert.equal(props.hasFitInitialMapRef.current, false);
  props.isNativeMapReady = true; render();
  assert.equal(env.calls.length, 3, 'fresh native map receives one initial fit');
  hooks.unmount();
});

test('driver perspective waits for route/layout, rejects bad fixes and only issues one nonanimated iOS command', () => {
  const hooks = hookHarness();
  const env = setup('ios', hooks.react);
  const { useDriverMapPerspective } = env.load('hooks/driver-navigation/useDriverMapPerspective.ts');
  const props = { data: { isTripOngoing: true }, refs: {
    hasEnabled3DRef: { current: false }, currentLocationRef: { current: { coords: pickup } },
  }, mapState: { isNativeMapReady: true, isLoadingRoute: true, mapRef: { current: env.map },
    heading: 20, currentLocation: {}, runMapCommand: fn => { fn(env.map); return true; } } };
  const render = () => hooks.render(() => useDriverMapPerspective(props));
  render(); assert.equal(env.calls.length, 0);
  props.mapState.isLoadingRoute = false;
  props.refs.currentLocationRef.current = { coords: { latitude: 0, longitude: 0 } };
  render(); assert.equal(env.calls.length, 0);
  props.refs.currentLocationRef.current = { coords: pickup };
  props.mapState.currentLocation = {};
  render(); assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0][0], 'camera');
  assert.deepEqual(env.calls[0][1], { center: pickup, pitch: 0, heading: 20, zoom: 17 });
  for (let i = 0; i < 1000; i++) { props.mapState.heading = i % 360; render(); }
  assert.equal(env.calls.length, 1);
  hooks.unmount();
});
