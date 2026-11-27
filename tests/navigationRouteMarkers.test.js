const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const a = { latitude: -4.3, longitude: 15.3 }, b = { latitude: -4.4, longitude: 15.4 };
const markers = tree => nodes(tree).filter(n => n.type === 'RoutePoint');
const load = loader({ 'react-native': { Platform: { OS: 'android' }, StyleSheet: { create: x => x } },
  'react-native-maps': { __esModule: true, default: 'Map', Marker: 'Marker', Polyline: 'Line' },
  './navigationModel': { USE_ANDROID_NAVIGATION_MARKER_IMAGES: true, IS_ANDROID: true },
  '@/components/maps/RoutePointMarker': { RoutePointMarker: 'RoutePoint' },
  '@/components/TrackingMapMarkers': { getVehicleTrackingMarkerImage: () => 'vehicle-image' },
});

test('driver keeps one highlighted next stop, original endpoint labels and route selection actions', () => {
  const { DriverNavigationMap } = load('features/driver-navigation/DriverNavigationMap.tsx');
  const selected = [];
  const props = { initialMapCoordinate: a,
    foundation: { data: { trip: { status: 'ongoing' }, isTripOngoing: true, tripDepartureCoordinate: a, tripArrivalCoordinate: b },
      mapState: { setRouteSectionFocus: value => selected.push(value) }, passengers: { passengerMapLocations: [] } },
    presentation: { routeSectionCoordinates: { nextCoordinates: [a, b], remainingCoordinates: [] },
      shouldShowTripArrivalMarker: true, tripDepartureLabel: 'Départ test', tripArrivalLabel: 'Arrivée test',
      currentNavigationWaypoint: { type: 'pickup', passenger: { name: 'Passager test' }, address: 'Repère', completed: false },
      currentNavigationWaypointCoordinate: a } };
  let tree = DriverNavigationMap(props);
  assert.deepEqual(markers(tree).map(n => [n.props.kind, !!n.props.highlighted]), [['departure', false], ['departure', true], ['arrival', false]]);
  assert.equal(markers(tree)[0].props.description, 'Départ test'); assert.equal(markers(tree)[1].props.zIndex, 26);
  nodes(tree).find(n => n.type === 'Line').props.onPress(); assert.deepEqual(selected, ['next']);
  props.presentation.currentNavigationWaypoint.type = 'dropoff';
  assert.equal(markers(DriverNavigationMap(props))[1].props.kind, 'arrival');
  props.presentation.currentNavigationWaypoint.completed = true;
  tree = DriverNavigationMap(props); assert.equal(markers(tree).length, 2);
  assert.equal(tree.props.moveOnMarkerPress, false); assert.equal(tree.props.scrollEnabled, true);
  props.foundation.data.trip = null; assert.equal(DriverNavigationMap(props), null);
});

test('passenger pickup disappears after boarding; destination, vehicle location and route actions remain correct', () => {
  const { PassengerNavigationMap } = load('features/passenger-navigation/PassengerNavigationMap.tsx');
  const selected = [], props = { state: { activeRouteSegment: 'route', setActiveRouteSegment: value => selected.push(value) },
    context: { isPassengerOnboard: false }, camera: { mapRegion: {} },
    driverCamera: { displayedDriverLocation: a, displayedDriverHeading: 90 },
    data: { trip: { vehicleType: 'car', departure: { address: 'Départ' }, arrival: { address: 'Arrivée' } },
      booking: { pickedUp: false, passengerOrigin: 'Départ passager', passengerDestination: 'Arrivée passager' } },
    coordinates: { pickupCoordinate: a, dropoffCoordinate: b }, presentation: { displayedRouteCoordinates: [a, b] } };
  let tree = PassengerNavigationMap(props);
  assert.deepEqual(markers(tree).map(n => n.props.kind), ['departure', 'arrival']);
  assert.deepEqual(markers(tree).map(n => n.props.description), ['Départ passager', 'Arrivée passager']);
  const driver = nodes(tree).find(n => n.type === 'Marker');
  assert.equal(driver.props.coordinate, a); assert.equal(driver.props.rotation, 90); assert.equal(driver.props.image, 'vehicle-image');
  nodes(tree).find(n => n.type === 'Line').props.onPress(); assert.deepEqual(selected, ['route']);
  props.data.booking.pickedUp = true; props.context.isPassengerOnboard = true;
  tree = PassengerNavigationMap(props); assert.deepEqual(markers(tree).map(n => n.props.kind), ['arrival']);
  assert.equal(tree.props.moveOnMarkerPress, false); assert.equal(tree.props.showsUserLocation, false);
  assert.equal(nodes(tree).filter(n => n.type === 'Line').length, 1, 'pickup connector disappears after boarding');
  props.data.booking = null; assert.equal(PassengerNavigationMap(props), null);
});
