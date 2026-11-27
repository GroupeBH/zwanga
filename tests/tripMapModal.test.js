const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const departure = { latitude: -4.3, longitude: 15.3 }, arrival = { latitude: -4.4, longitude: 15.4 };
for (const platform of ['android', 'ios']) test(`${platform}: expanded route waits for readiness, preserves gestures and stops commands after closing`, t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = hookHarness(); t.after(h.unmount);
  const f = { active: true }, camera = [], close = [];
  const { TripMapModal } = loader({
    react: { ...React, ...h.react },
    'react-native': { View: 'View', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x },
      Platform: { OS: platform }, InteractionManager: { runAfterInteractions: fn => { fn(); return { cancel() {} }; } } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-maps': { __esModule: true, default: 'Map', Polyline: 'Line' },
    './tripDetailModel': { TRIP_DETAIL_MAP_PROVIDER: 'google' },
    '@/components/maps/RoutePointMarker': { RoutePointMarker: 'Marker' },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => f.active },
  })('features/trip-detail/TripMapModal.tsx');
  const props = { mapModalVisible: true, setMapModalVisible: value => close.push(value), insets: { top: 30, bottom: 20 },
    mapRegion: { ...departure, latitudeDelta: 0.1, longitudeDelta: 0.1 }, departureCoordinate: departure, arrivalCoordinate: arrival,
    routeMapCoordinates: [departure, arrival], hasDetailedRouteMapCoordinates: false,
    routeLabels: { departure: { title: 'Départ test', address: 'Repère départ' }, arrival: { title: 'Arrivée test', address: 'Repère arrivée' } },
    passengerDestinationMarkers: [{ id: 'p', coordinate: arrival, title: 'Destination passager', description: 'Repère passager' }] };
  const render = () => h.render(() => TripMapModal(props));
  assert.equal(nodes(render()).some(n => n.type === 'Map'), false);
  t.mock.timers.tick(500);
  const tree = render(), map = nodes(tree).find(n => n.type === 'Map');
  map.props.ref.current = { fitToCoordinates: (...args) => camera.push(args) };
  map.props.onMapReady(); render(); assert.equal(camera.length, 0);
  map.props.onLayout({ nativeEvent: { layout: { width: 320, height: 400 } } }); render();
  assert.equal(camera.length, 1);
  assert.deepEqual(nodes(tree).filter(n => n.type === 'Marker').map(n => n.props.kind), ['departure', 'arrival', 'passenger']);
  assert.equal(nodes(tree).some(n => n.type === 'Line'), false, 'no straight-line substitute for the road route');
  map.props.onTouchStart(); // Also catches an iOS pinch without Google Maps isGesture metadata.
  props.routeMapCoordinates = [departure, { latitude: -4.5, longitude: 15.5 }, arrival];
  props.hasDetailedRouteMapCoordinates = true;
  let next = render(); assert.equal(camera.length, 1);
  assert.equal(nodes(next).find(n => n.type === 'Line').props.lineDashPattern, undefined);
  nodes(next).find(n => n.props.accessibilityLabel === 'Recentrer l’itinéraire').props.onPress();
  assert.equal(camera.length, 2); assert.equal(camera.at(-1)[1].animated, platform === 'android');
  nodes(next).find(n => n.props.accessibilityLabel === 'Fermer la carte').props.onPress();
  assert.deepEqual(close, [false]);
  f.active = false; next = render(); assert.equal(nodes(next).some(n => n.type === 'Map'), false);
  nodes(next).find(n => n.props.accessibilityLabel === 'Recentrer l’itinéraire').props.onPress();
  assert.equal(camera.length, 2);
  f.active = true; render(); t.mock.timers.tick(500); render();
  map.props.onMapReady(); map.props.onLayout({ nativeEvent: { layout: { width: 320, height: 400 } } });
  render(); assert.equal(camera.length, 2, 'old native events cannot enable a reopened map');
});
