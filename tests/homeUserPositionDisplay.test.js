const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const native = { View: 'View', Text: 'Text', StyleSheet: { create: value => value, absoluteFillObject: {} },
  Platform: { OS: 'android', select: value => value.android } };
const { HomeMap } = loader({
  'react-native': native,
  'react-native-maps': { __esModule: true, default: 'Map', Marker: 'Marker', PROVIDER_GOOGLE: 'google' },
  '@/assets/images/map-markers/home-position-dot.png': 'position-image',
})('components/home/HomeMap.tsx');
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
}
const own = { latitude: -4.34, longitude: 15.31 };
const region = { ...own, latitudeDelta: 0.008, longitudeDelta: 0.008 };
const props = { shouldRenderHomeMap: true, mapRegion: region, mapRef: { current: null }, mapBottomOffset: 440,
  userLocationMarkerRef: { current: null }, userLocationMarker: null, liveUserCoordinate: null };

test('Home shows only the own coordinate, using a static native image and an explicit position label', () => {
  const elements = nodes(HomeMap.type({ ...props, liveUserCoordinate: own,
    userLocationMarker: { coordinate: { latitude: -4.4, longitude: 15.4 } },
    homeMapTrips: [{ id: 'other' }], visibleDriverPassengerMarkers: [{ id: 'passenger' }],
  }));
  const markers = elements.filter(node => node.type === 'Marker');
  assert.equal(markers.length, 1);
  assert.deepEqual(markers[0].props.coordinate, own);
  assert.equal(markers[0].props.image, 'position-image');
  assert.equal(markers[0].props.tracksViewChanges, false);
  assert.equal(markers[0].props.children, undefined, 'no custom React marker bitmap capture');
  assert.ok(elements.some(node => node.type === 'Text' && node.props.children === 'Votre position'));
});

test('without valid GPS there is no made-up user marker at the default map center', () => {
  for (const coordinate of [null, { latitude: NaN, longitude: 15.3 }, { latitude: 0, longitude: 0 }]) {
    const elements = nodes(HomeMap.type({ ...props, liveUserCoordinate: coordinate }));
    assert.equal(elements.some(node => node.type === 'Marker'), false);
    assert.ok(elements.some(node => node.type === 'Text' && node.props.children === 'Position en attente'));
  }
});

test('manual position fallback remains visible; leaving Home removes both native map and legend', () => {
  const current = { ...props, userLocationMarker: { coordinate: own } };
  assert.deepEqual(nodes(HomeMap.type(current)).find(node => node.type === 'Marker').props.coordinate, own);
  const elements = nodes(HomeMap.type({ ...current, shouldRenderHomeMap: false }));
  assert.equal(elements.some(node => ['Map', 'Marker', 'Text'].includes(node.type)), false);
});

test('native map readiness centers the camera on the current own region, above the dashboard', () => {
  const calls = [];
  const tree = HomeMap.type({ ...props, mapRef: { current: { animateToRegion: (...args) => calls.push(args) } } });
  const map = nodes(tree).find(node => node.type === 'Map');
  map.props.onMapReady(); assert.deepEqual(calls, [[region, 0]]);
  assert.equal(Object.assign({}, ...tree.props.style).bottom, props.mapBottomOffset);
});

test('compact priorities can hide the redundant legend without moving or removing the actual user marker', () => {
  const regular = nodes(HomeMap.type({ ...props, liveUserCoordinate: own }));
  const elements = nodes(HomeMap.type({ ...props, liveUserCoordinate: own, showLocationLegend: false }));
  assert.equal(elements.find(node => node.type === 'Map').props.mapPadding,
    regular.find(node => node.type === 'Map').props.mapPadding);
  assert.equal(elements.filter(node => node.type === 'Marker').length, 1);
  assert.deepEqual(elements.find(node => node.type === 'Marker').props.coordinate, own);
  assert.equal(elements.some(node => node.type === 'Text'), false);
});
