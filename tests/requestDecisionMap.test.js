const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements) : React.isValidElement(tree)
  ? [tree, ...elements(tree.props.children)] : [];
const words = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(words).join(' ') : words(tree?.props?.children ?? '');
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: x => x } };
const departure = { latitude: -4.3, longitude: 15.3 }, arrival = { latitude: -4.4, longitude: 15.4 };
const road = [departure, { latitude: -4.31, longitude: 15.32 }, { latitude: -4.35, longitude: 15.38 }, arrival];
const mapData = { departureCoordinate: departure, arrivalCoordinate: arrival, fallbackCoordinates: [departure, arrival],
  initialRegion: { latitude: -4.35, longitude: 15.35, latitudeDelta: 0.15, longitudeDelta: 0.15 } };

function preview(t, getRoute = async () => road) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(), calls = [], camera = [];
  const f = { active: true, props: { arrivalName: 'Arrivée test', departureName: 'Départ test', mapData,
    routeCoordinates: [], variant: 'light', initiallyExpanded: true } };
  t.after(() => hooks.unmount());
  const { CollapsibleRouteMap } = loader({ react: { ...React, ...hooks.react }, 'react-native': { ...native,
    Platform: { OS: 'android' }, InteractionManager: { runAfterInteractions: callback => { callback(); return { cancel() {} }; } } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-maps': { __esModule: true, default: 'MapView', Marker: 'Marker', Polyline: 'Polyline' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => f.active },
    '@/assets/images/map-markers/trip-detail-marker-departure.png': 'departure-image',
    '@/assets/images/map-markers/trip-detail-marker-arrival.png': 'arrival-image',
    '@/utils/routeApi': { getRouteCoordinates: (...args) => { calls.push(args); return getRoute(...args); } },
  })('features/request-detail/CollapsibleRouteMap.tsx');
  return { f, calls, camera, render: () => {
    hooks.render(() => CollapsibleRouteMap(f.props)); t.mock.timers.tick(500);
    const tree = hooks.render(() => CollapsibleRouteMap(f.props));
    const map = elements(tree).find(item => item.type === 'MapView');
    if (map) map.props.ref.current = { fitToCoordinates: (...args) => camera.push(args) };
    return tree;
  }, unmount: () => hooks.unmount() };
}

test('camera waits for native ready AND valid layout; static markers never track child views', t => {
  const f = preview(t); f.f.props.routeCoordinates = road;
  const tree = f.render(), map = elements(tree).find(item => item.type === 'MapView');
  assert.equal(f.camera.length, 0);
  map.props.onMapReady(); f.render(); assert.equal(f.camera.length, 0);
  map.props.onLayout({ nativeEvent: { layout: { width: 0, height: 154 } } });
  f.render(); assert.equal(f.camera.length, 0);
  map.props.onLayout({ nativeEvent: { layout: { width: 320, height: 154 } } });
  f.render(); assert.equal(f.camera.length, 1); assert.deepEqual(f.camera[0][0], road);
  f.render(); assert.equal(f.camera.length, 1, 'ordinary renders do not recenter');
  for (const marker of elements(tree).filter(item => item.type === 'Marker')) {
    assert.equal(marker.props.tracksViewChanges, false);
    assert.ok(marker.props.image); assert.equal(marker.props.children, undefined);
  }
  f.f.active = false; f.render();
  map.props.onMapReady(); map.props.onLayout({ nativeEvent: { layout: { width: 320, height: 154 } } });
  f.f.active = true; f.render(); assert.equal(f.camera.length, 1, 'stale ready events cannot target the reopened map');
});

test('changing endpoints discards the old route while the new lookup is pending', async t => {
  let call = 0;
  const f = preview(t, () => ++call === 1 ? Promise.resolve(road) : new Promise(() => {}));
  f.render(); await Promise.resolve(); f.render();
  const next = { latitude: -4.5, longitude: 15.6 };
  f.f.props.mapData = { ...mapData, arrivalCoordinate: next, fallbackCoordinates: [departure, next] };
  const line = elements(f.render()).find(item => item.type === 'Polyline');
  assert.deepEqual(line.props.coordinates, [departure, next]);
});

test('discreet route action starts collapsed, loads on demand and can close without a modal', async t => {
  const f = preview(t);
  Object.assign(f.f.props, { initiallyExpanded: false, toggleAppearance: 'text', expandLabel: 'Voir le trajet sur la carte' });
  let tree = f.render();
  const action = elements(tree).find(item => item.type === 'Pressable');
  assert.equal(action.props.accessibilityLabel, 'Voir le trajet sur la carte');
  assert.equal(action.props.accessibilityState.expanded, false);
  assert.equal(words(action), ' Voir le trajet sur la carte ');
  const style = Object.assign({}, ...action.props.style({ pressed: false }).filter(Boolean));
  assert.equal(style.alignSelf, 'stretch'); assert.equal(style.minHeight, 44);
  assert.equal(style.backgroundColor, 'transparent');
  const label = elements(action).find(item => item.type === 'Text');
  assert.equal(label.props.numberOfLines, undefined, 'large text can wrap instead of being truncated');
  assert.equal(elements(tree).some(item => item.type === 'MapView'), false); assert.equal(f.calls.length, 0);
  f.render(); assert.equal(f.calls.length, 0, 'ordinary updates keep the initial view lightweight');
  action.props.onPress(); tree = f.render();
  assert.equal(f.calls.length, 1); assert.equal(elements(tree).some(item => item.type === 'MapView'), true);
  await Promise.resolve(); tree = f.render();
  assert.equal(elements(tree).find(item => item.type === 'Polyline').props.coordinates, road);
  const close = elements(tree).find(item => item.type === 'Pressable');
  assert.equal(close.props.accessibilityState.expanded, true); assert.match(words(close), /Masquer la carte/);
  close.props.onPress(); tree = f.render();
  assert.equal(elements(tree).some(item => item.type === 'MapView'), false); assert.equal(f.calls.length, 1);
  assert.match(words(tree), /Voir le trajet sur la carte/);
});

test('a missing route has a readable unavailable label instead of an unexplained disabled icon', t => {
  const f = preview(t);
  Object.assign(f.f.props, { initiallyExpanded: false, toggleAppearance: 'text', mapData: null });
  const tree = f.render();
  assert.match(words(tree), /Carte indisponible/);
  assert.equal(Object.assign({}, ...tree.props.style.filter(Boolean)).backgroundColor, 'transparent',
    'the disabled map action must not inherit a dark button behind dark text');
  assert.equal(elements(tree).some(item => item.type === 'Pressable'), false);
  assert.equal(f.calls.length, 0);
});

test('default light map action retains the existing compact label for other screens', t => {
  const f = preview(t); f.f.props.initiallyExpanded = false;
  const tree = f.render(), action = elements(tree).find(item => item.type === 'Pressable');
  assert.equal(words(action).trim(), 'Carte');
  assert.equal(action.props.accessibilityLabel, 'Afficher la carte du trajet');
  assert.notEqual(Object.assign({}, ...action.props.style({ pressed: false }).filter(Boolean)).backgroundColor, 'transparent');
});

test('expanded decision map loads the road from the passenger departure to arrival with distinct endpoints', async t => {
  const f = preview(t); f.render();
  assert.deepEqual(f.calls, [[departure, arrival]]);
  await Promise.resolve();
  const tree = f.render(), line = elements(tree).find(item => item.type === 'Polyline');
  assert.equal(line.props.coordinates, road); assert.equal(line.props.lineDashPattern, undefined);
  assert.match(words(tree), /Itinéraire demandé/);
  const markers = elements(tree).filter(item => item.type === 'Marker');
  assert.deepEqual(markers.map(item => [item.props.title, item.props.coordinate]), [['Départ', departure], ['Destination', arrival]]);
  assert.deepEqual(markers.map(item => item.props.description), ['Départ test', 'Arrivée test']);
  assert.equal(elements(tree).find(item => item.type === 'MapView').props.showsUserLocation, undefined, 'preview does not start a GPS subscription');
  f.render(); assert.equal(f.calls.length, 1, 'ordinary re-render does not start another request');
  elements(tree).find(item => item.type === 'Pressable').props.onPress();
  assert.equal(elements(f.render()).some(item => item.type === 'MapView'), false);
});

test('supplied route is reused without another directions request', t => {
  const f = preview(t); f.f.props.routeCoordinates = road;
  const tree = f.render();
  assert.equal(f.calls.length, 0);
  assert.equal(elements(tree).find(item => item.type === 'Polyline').props.coordinates, road);
});

test('overview draws the requested route without a toggle or extra tap', async t => {
  const f = preview(t);
  Object.assign(f.f.props, { initiallyExpanded: false, displayMode: 'overview', overviewHeight: 295 });
  let tree = f.render();
  assert.equal(elements(tree).some(item => item.type === 'Pressable'), false);
  assert.deepEqual(f.calls, [[departure, arrival]]);
  const frame = elements(tree).find(item => item.props.testID === 'request-decision-map');
  const style = Object.assign({}, ...frame.props.style.filter(Boolean));
  assert.equal(style.height, 295); assert.equal(style.borderRadius, 0);
  await Promise.resolve(); tree = f.render();
  assert.equal(elements(tree).find(item => item.type === 'Polyline').props.coordinates, road);
  assert.deepEqual(elements(tree).filter(item => item.type === 'Marker').map(item => item.props.coordinate), [departure, arrival]);
  f.f.active = false;
  assert.equal(elements(f.render()).some(item => item.type === 'MapView'), false);
  assert.equal(f.calls.length, 1, 'overview never fetches while the screen is hidden');
});

test('overview without coordinates remains a short readable notice, not an empty map', t => {
  const f = preview(t);
  Object.assign(f.f.props, { displayMode: 'overview', mapData: null });
  const tree = f.render();
  assert.match(words(tree), /Carte indisponible.*adresses ci-dessous/);
  assert.equal(elements(tree).some(item => item.props.testID === 'request-decision-map'), false);
  assert.equal(f.calls.length, 0);
});

test('polling a new object with the same endpoints does not recenter the overview fallback', t => {
  const f = preview(t, () => new Promise(() => {}));
  Object.assign(f.f.props, { displayMode: 'overview', overviewHeight: 295 });
  const map = elements(f.render()).find(item => item.type === 'MapView');
  map.props.onMapReady(); map.props.onLayout({ nativeEvent: { layout: { width: 390, height: 295 } } });
  f.render(); assert.equal(f.camera.length, 1);
  f.f.props.mapData = { ...mapData, fallbackCoordinates: [...mapData.fallbackCoordinates] };
  f.render(); assert.equal(f.camera.length, 1); assert.equal(f.calls.length, 1);
  f.f.props.overviewHeight = 200;
  f.render(); assert.equal(f.camera.length, 2, 'orientation resizes still frame the two endpoints');
});

test('route service failure leaves a dotted departure/destination preview, not a fake road', async t => {
  const f = preview(t, async () => { throw new Error('offline'); }); f.render();
  await Promise.resolve(); await Promise.resolve();
  const tree = f.render(), line = elements(tree).find(item => item.type === 'Polyline');
  assert.deepEqual(line.props.coordinates, [departure, arrival]);
  assert.deepEqual(line.props.lineDashPattern, [4, 4]);
  assert.match(words(tree), /Départ et destination/); assert.doesNotMatch(words(tree), /Itinéraire demandé/);
});

test('inactive or coordinate-free detail mounts no map and requests no route', t => {
  const f = preview(t); f.f.active = false;
  assert.equal(elements(f.render()).some(item => item.type === 'MapView'), false);
  assert.equal(f.calls.length, 0);
  f.f.active = true; f.f.props.mapData = null;
  const tree = f.render();
  assert.equal(elements(tree).some(item => item.type === 'MapView'), false); assert.equal(f.calls.length, 0);
  assert.ok(elements(tree).some(item => item.props.accessibilityLabel === 'Carte indisponible pour ce trajet'));
});

test('route lookup finishing after collapse does not change the visible preview state', async t => {
  let resolve;
  const f = preview(t, () => new Promise(done => { resolve = done; }));
  const tree = f.render(); elements(tree).find(item => item.type === 'Pressable').props.onPress(); f.render();
  resolve(road); await Promise.resolve();
  assert.equal(elements(f.render()).some(item => item.type === 'MapView'), false);
  assert.equal(f.calls.length, 1);
});

test('presentation rejects missing, nonfinite and out-of-bounds map points before native mounting', () => {
  const { buildRequestDetailPresentation } = loader({ 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' } })('features/request-detail/requestPresentation.ts');
  const request = { status: 'pending', departure: { lat: departure.latitude, lng: departure.longitude },
    arrival: { lat: arrival.latitude, lng: arrival.longitude } };
  const build = tripRequest => buildRequestDetailPresentation({ tripRequest, routeCoordinates: [], compatibleActiveVehicles: [] });
  assert.deepEqual(build(request).requestRouteMapData.fallbackCoordinates, [departure, arrival]);
  for (const field of ['departure', 'arrival']) for (const point of [undefined, { lat: NaN, lng: 15 },
    { lat: -4, lng: Infinity }, { lat: 91, lng: 15 }, { lat: -4, lng: -181 }, { lat: '-4', lng: 15 }]) {
    assert.equal(build({ ...request, [field]: point }).requestRouteMapData, null);
  }
});
