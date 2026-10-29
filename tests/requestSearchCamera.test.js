const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements) : React.isValidElement(tree)
  ? [tree, ...elements(tree.props.children)] : [];

function mapFixture(t) {
  const hooks = hookHarness(), fits = []; t.after(() => hooks.unmount());
  const state = { ready: false, projections: 0, layouts: 0 };
  const nativeMap = { fitToCoordinates: (coordinates, options) => fits.push({ coordinates, options }),
    pointForCoordinate: async () => { state.projections++; return { x: 80, y: 100 }; } };
  const runMapCommand = callback => { if (!state.ready) return false; callback(nativeMap); return true; };
  const Map = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Animated: { View: 'AnimatedView' },
      Platform: { OS: 'android' }, StyleSheet: { create: x => x, absoluteFill: {} } },
    'react-native-maps': { __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/hooks/navigation/useNavigationMapLifecycle': { useNavigationMapLifecycle: ({ enabled }) => ({
      shouldRenderMap: enabled, isMapReady: state.ready, runMapCommand, onMapReady() {}, onMapLayout() { state.layouts++; },
    }) },
    '@/hooks/home/useLocationPermissionPulse': { useLocationPermissionPulse: () => 1 },
    '@/components/TrackingMapMarkers': { getVehicleTrackingMarkerImage: type => `${type}.png` },
    '@/assets/images/map-markers/trip-detail-marker-departure.png': 'departure.png',
    '@/assets/images/map-markers/home-position-dot.png': 'position.png',
  })('features/request-detail/RequestSearchMap.tsx').RequestSearchMap.type;
  const props = { requestId: 'request', active: true, departure: { latitude: -4.3, longitude: 15.3 }, position: null, vehicles: [] };
  const render = () => hooks.render(() => Map(props));
  const vehicle = { id: 'v1', latitude: -4.302, longitude: 15.301, vehicleType: 'motorcycle_2_wheels', ageMs: 100000 };
  return { props, state, fits, render, vehicle };
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

test('a panel resize reprojects the position pulse without requesting GPS or repositioning vehicles', async t => {
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
