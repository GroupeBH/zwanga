const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements) : React.isValidElement(tree)
  ? [tree, ...elements(tree.props.children)] : [];

function mapFixture(t) {
  const hooks = hookHarness(), fits = []; t.after(() => hooks.unmount());
  const state = { ready: false, projections: 0, layouts: 0, projected: [], project: async () => ({ x: 80, y: 100 }) };
  const nativeMap = { fitToCoordinates: (coordinates, options) => fits.push({ coordinates, options }),
    pointForCoordinate: coordinate => { state.projections++; state.projected.push(coordinate); return state.project(); } };
  const runMapCommand = callback => { if (!state.ready) return false; callback(nativeMap); return true; };
  const Map = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Animated: { View: 'AnimatedView' },
      Platform: { OS: 'android' }, StyleSheet: { create: x => x, absoluteFill: {} } },
    'react-native-maps': { __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/hooks/navigation/useNavigationMapLifecycle': { useNavigationMapLifecycle: ({ enabled }) => ({
      shouldRenderMap: enabled, isMapReady: state.ready, runMapCommand, onMapReady() {}, onMapLayout() { state.layouts++; },
    }) },
    './RequestPickupBeacon': { RequestPickupBeacon: 'Beacon' },
    '@/components/TrackingMapMarkers': { getVehicleTrackingMarkerImage: type => `${type}.png` },
    '@/assets/images/map-markers/trip-detail-marker-departure.png': 'departure.png',
    '@/assets/images/map-markers/home-position-dot.png': 'position.png',
    '@/assets/images/map-markers/user-location-marker.png': 'gps.png',
  })('features/request-detail/RequestSearchMap.tsx').RequestSearchMap.type;
  const props = { requestId: 'request', active: true, departure: { latitude: -4.3, longitude: 15.3 }, position: null, vehicles: [] };
  const render = () => hooks.render(() => Map(props));
  const vehicle = { id: 'v1', latitude: -4.302, longitude: 15.301, vehicleType: 'motorcycle_2_wheels', ageMs: 100000 };
  return { props, state, fits, render, vehicle, hooks };
}

test('camera waits for readiness, frames the first vehicles once, then leaves polling updates alone', t => {
  const f = mapFixture(t); f.render(); assert.equal(f.fits.length, 0);
  f.state.ready = true; f.render(); assert.equal(f.fits.length, 1);
  f.props.vehicles = [f.vehicle]; f.render(); assert.equal(f.fits.length, 2);
  const { coordinates } = f.fits[1];
  assert.ok(coordinates[1].latitude - coordinates[0].latitude < .01);
  f.props.vehicles = [{ ...f.vehicle, ageMs: 130000 }]; f.render(); assert.equal(f.fits.length, 2);
  f.props.requestId = 'another-request'; f.render(); assert.equal(f.fits.length, 3);
});

test('panning before positions arrive prevents surprise recentering; explicit recenter remains available', t => {
  const f = mapFixture(t); f.state.ready = true;
  const tree = f.render(); assert.equal(f.fits.length, 1);
  elements(tree).find(node => node.type === 'MapView').props.onPanDrag();
  f.props.vehicles = [f.vehicle]; const updated = f.render(); assert.equal(f.fits.length, 1);
  elements(updated).find(node => node.props.accessibilityLabel === 'Voir les véhicules autour du départ').props.onPress();
  assert.equal(f.fits.length, 2); assert.equal(f.fits[1].options.animated, true);
});

test('a panel resize reprojects the pickup waves without requesting GPS or repositioning vehicles', async t => {
  const f = mapFixture(t); f.state.ready = true; f.props.position = f.props.departure; f.props.vehicles = [f.vehicle];
  let tree = f.render(); await new Promise(resolve => setImmediate(resolve)); tree = f.render();
  const previous = f.state.projections;
  elements(tree).find(node => node.type === 'MapView').props.onLayout({ nativeEvent: { layout: { width: 390, height: 500 } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.layouts, 1); assert.equal(f.state.projections, previous + 1);
  assert.equal(f.fits.length, 1, 'layout changes do not reset user zoom');
  const marker = elements(f.render()).find(node => node.key === f.vehicle.id);
  assert.deepEqual(marker.props.coordinate, { latitude: f.vehicle.latitude, longitude: f.vehicle.longitude });
});

const tick = () => new Promise(resolve => setImmediate(resolve));
const beacon = tree => elements(tree).find(node => node.type === 'Beacon');

test('pickup is the wave epicentre even without GPS, and moving the phone never moves that epicentre', async t => {
  const f = mapFixture(t); f.state.ready = true;
  f.render(); await tick();
  assert.deepEqual(f.state.projected, [f.props.departure]);
  assert.ok(beacon(f.render()), 'no GPS fix is required for the persisted pickup');
  f.props.position = { latitude: -4.33, longitude: 15.34 };
  let tree = f.render(); await tick(); tree = f.render();
  assert.equal(f.state.projections, 1, 'GPS updates only move the separate static position marker');
  assert.equal(beacon(tree).props.point.latitude, f.props.departure.latitude);
  const departure = elements(tree).find(node => node.key === 'departure');
  assert.equal(departure.props.title, 'Votre départ'); assert.equal(departure.props.tracksViewChanges, false);
  const gps = elements(tree).find(node => node.key === 'position');
  assert.equal(gps.props.title, 'Votre position actuelle'); assert.equal(gps.props.image, 'gps.png');
  f.props.position = f.props.departure;
  assert.equal(elements(f.render()).some(node => node.key === 'position'), false, 'no overlapping GPS pin at pickup');
});

test('waves disappear during map movement, reproject at rest, and stop when hidden or no longer searching', async t => {
  const f = mapFixture(t); f.state.ready = true; f.props.searching = true;
  f.render(); await tick(); assert.equal(beacon(f.render()).props.enabled, true);
  let native = elements(f.render()).find(node => node.type === 'MapView');
  native.props.onRegionChange(); assert.equal(beacon(f.render()), undefined);
  native.props.onRegionChangeComplete({ ...f.props.departure, latitudeDelta: .01, longitudeDelta: .01 });
  await tick(); assert.ok(beacon(f.render()));
  f.props.searching = false; assert.equal(beacon(f.render()).props.enabled, false);
  f.props.active = false; const projections = f.state.projections;
  assert.equal(beacon(f.render()), undefined); await tick();
  assert.equal(f.state.projections, projections);
});

test('late, rejected and non-finite native projections cannot leave a wave on the wrong place', async t => {
  const f = mapFixture(t); f.state.ready = true;
  let resolve; f.state.project = () => new Promise(done => { resolve = done; });
  f.render(); const old = resolve;
  f.props.departure = { latitude: -4.35, longitude: 15.36 }; f.render();
  old({ x: 500, y: 500 }); await tick(); assert.equal(beacon(f.render()), undefined);
  resolve({ x: NaN, y: Infinity }); await tick(); assert.equal(beacon(f.render()), undefined);
  f.state.project = async () => { throw Error('native unavailable'); };
  f.props.requestId = 'retry'; f.render(); await tick(); assert.equal(beacon(f.render()), undefined);
  f.state.project = () => new Promise(done => { resolve = done; });
  f.props.requestId = 'new'; f.render(); f.props.active = false; f.render();
  resolve({ x: 80, y: 100 }); await tick(); assert.equal(beacon(f.render()), undefined);
  f.props.active = true; f.render(); f.hooks.unmount(); resolve({ x: 80, y: 100 }); await tick();
});
