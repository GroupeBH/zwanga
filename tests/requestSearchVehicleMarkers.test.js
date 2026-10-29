const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements) : React.isValidElement(tree)
  ? [tree, ...elements(tree.props.children)] : [];

test('the map renders distinct vehicle images at unrounded positions with age in their callouts', t => {
  const hooks = hookHarness(), commands = []; t.after(() => hooks.unmount());
  const load = loader({
    react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Animated: { View: 'AnimatedView' },
      Platform: { OS: 'android' }, StyleSheet: { create: x => x, absoluteFill: {} } },
    'react-native-maps': { __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/hooks/navigation/useNavigationMapLifecycle': { useNavigationMapLifecycle: ({ enabled }) => ({
      shouldRenderMap: enabled, isMapReady: false,
      runMapCommand: command => command({ fitToCoordinates: bounds => commands.push(bounds) }), onMapReady() {}, onMapLayout() {},
    }) },
    '@/hooks/home/useLocationPermissionPulse': { useLocationPermissionPulse: () => 1 },
    '@/components/TrackingMapMarkers': { getVehicleTrackingMarkerImage: type => `${type}.png` },
    '@/assets/images/map-markers/trip-detail-marker-departure.png': 'departure.png',
    '@/assets/images/map-markers/home-position-dot.png': 'position.png',
  });
  const MemoMap = load('features/request-detail/RequestSearchMap.tsx').RequestSearchMap;
  const Map = MemoMap.type;
  const props = { requestId: 'request', active: true, departure: { latitude: -4.3, longitude: 15.3 }, position: null,
    vehicles: ['car', 'motorcycle_2_wheels', 'motorcycle_3_wheels'].map((vehicleType, i) => ({ id: `v-${i}`,
      latitude: -4.3011, longitude: 15.3011 + i / 10000, vehicleType, ageMs: i * 3600000 })) };
  const tree = hooks.render(() => Map(props));
  const vehicles = elements(tree).filter(node => node.type === 'Marker' && node.key?.startsWith('v-'));
  assert.equal(vehicles.length, 3);
  assert.deepEqual(vehicles.map(v => v.props.image), ['car.png', 'moto.png', 'tricycle.png']);
  assert.deepEqual(vehicles.map(v => v.props.title), ['Voiture', 'Moto', 'Tricycle']);
  assert.deepEqual(vehicles.map(v => v.props.opacity), [1, 0.55, 0.55]);
  assert.match(vehicles[1].props.description, /il y a 1 h · position ancienne/);
  for (const [i, vehicle] of vehicles.entries()) {
    assert.equal(vehicle.props.tracksViewChanges, false);
    assert.deepEqual(vehicle.props.coordinate, { latitude: props.vehicles[i].latitude, longitude: props.vehicles[i].longitude });
  }
  const crowded = { ...props, vehicles: Array.from({ length: 500 }, (_, i) => ({ ...props.vehicles[0], id: `v-${i}` })) };
  const groups = elements(hooks.render(() => Map(crowded))).filter(node => node.type === 'Marker' && node.key?.startsWith('group:'));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].props.title, '500 véhicules · positions connues');
  assert.equal(groups[0].props.tracksViewChanges, false);
  assert.equal(typeof groups[0].props.onPress, 'function');
  groups[0].props.onPress();
  assert.equal(commands.length, 1);
  assert.ok(commands[0][0].latitude < crowded.vehicles[0].latitude);
  assert.ok(commands[0][1].longitude > crowded.vehicles[0].longitude);
  assert.equal(MemoMap.compare(props, { ...props, departure: { ...props.departure } }), true,
    'parent query refreshes do not redraw unchanged map data');
  for (const patch of [{ active: false }, { requestId: 'other' }, { vehicles: [...props.vehicles] },
    { departure: { ...props.departure, latitude: -4.4 } }, { position: { latitude: -4.31, longitude: 15.3 } }])
    assert.equal(MemoMap.compare(props, { ...props, ...patch }), false);
  const distributed = { ...props, vehicles: Array.from({ length: 500 }, (_, i) => ({ ...props.vehicles[0], id: `v-${i}`,
    latitude: -4.349 + (i % 20) * .005, longitude: 15.251 + Math.floor(i / 20) * .004 })) };
  const mapTree = hooks.render(() => Map(distributed));
  const nativeMap = elements(mapTree).find(node => node.type === 'MapView');
  const zoom = { latitude: distributed.vehicles[0].latitude, longitude: distributed.vehicles[0].longitude,
    latitudeDelta: .001, longitudeDelta: .001 };
  nativeMap.props.onRegionChange(zoom);
  assert.ok(elements(hooks.render(() => Map(distributed))).some(node => node.key?.startsWith('group:')),
    'no regrouping on each gesture frame');
  nativeMap.props.onRegionChangeComplete(zoom);
  const zoomed = elements(hooks.render(() => Map(distributed))).filter(node => node.type === 'Marker' && node.key?.startsWith('v-'));
  assert.equal(zoomed.length, 1); assert.equal(zoomed[0].key, 'v-0');
  assert.equal(elements(hooks.render(() => Map({ ...props, active: false }))).some(node => node.type === 'MapView'), false);
});
