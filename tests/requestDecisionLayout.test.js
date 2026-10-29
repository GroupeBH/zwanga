const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const elements = tree => Array.isArray(tree) ? tree.flatMap(elements) : React.isValidElement(tree)
  ? [tree, ...elements(tree.props.children)] : [];
const words = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree)
  ? tree.map(words).join(' ') : words(tree?.props?.children ?? '');
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', FlatList: 'FlatList', ScrollView: 'ScrollView',
  TouchableOpacity: 'TouchableOpacity', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: x => x },
  useWindowDimensions: () => ({ height: 844, width: 390 }) };
const labels = { departure: { title: 'Départ', reference: 'Repère de départ' }, arrival: { title: 'Destination', reference: 'Repère d’arrivée' } };
const vehicle = id => ({ id, brand: 'Marque test', model: `Modèle ${id}`, licensePlate: `TEST-${id}` });
const request = { id: 'order', passengerId: 'passenger', passengerName: 'Passager test', status: 'pending', numberOfSeats: 2,
  departureDateMin: '2099-01-01T19:30:00', departureDateMax: '2099-01-01T20:00:00', maxPricePerSeat: 2000, paymentMode: 'cash' };
const model = { userId: 'driver', tripRequest: request, requestedVehicleType: 'car', compatibleActiveVehicles: [vehicle('one'), vehicle('two')],
  isIdentityVerified: true, isDriverAccount: true, canAcceptDirectly: true, canRespondToRequest: true, directAcceptVehicle: null, directAcceptVehicleId: '',
  routeCoordinates: [], canEdit: false, canCancel: false };
const mocks = { react: React, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/hooks/request-detail/useRequestResponseWindow': { useRequestResponseWindow: () => ({ blocked: false, closed: false, label: null }) },
  '@/hooks/useRouteLocationLabels': { useRouteLocationLabels: () => labels },
  '@/components/trip/RouteLocationDetails': { RouteLocationDetails: 'Route' },
  './RequestPassengerContact': { RequestPassengerContact: 'Contact' },
  './RequestDecisionVehiclePicker': { RequestDecisionVehiclePicker: 'VehiclePicker' },
  './CollapsibleRouteMap': { CollapsibleRouteMap: 'RouteMap' },
  './RequestDecisionOptions': { RequestDecisionOptions: 'Options' },
  '@/features/driver-payments/CashCommissionNotice': { CashCommissionNotice: 'Commission' },
};
const presentation = { requestRouteMapData: { departureCoordinate: { latitude: -4.3, longitude: 15.3 },
  arrivalCoordinate: { latitude: -4.4, longitude: 15.4 } },
displayedRouteCoordinates: [{ latitude: -4.3, longitude: 15.3 }, { latitude: -4.35, longitude: 15.35 }, { latitude: -4.4, longitude: 15.4 }] };

function picker(t, vehicles = model.compatibleActiveVehicles) {
  const hooks = hookHarness(), calls = [];
  const f = { model: { ...model, compatibleActiveVehicles: vehicles }, disabled: false, height: 800 };
  f.model.setDirectAcceptVehicleId = id => {
    calls.push(id); f.model.directAcceptVehicleId = id;
    f.model.directAcceptVehicle = f.model.compatibleActiveVehicles.find(item => item.id === id) ?? null;
  };
  const { RequestDecisionVehiclePicker } = loader({ ...mocks, react: { ...React, ...hooks.react },
    'react-native': { ...native, useWindowDimensions: () => ({ height: f.height, width: 360, fontScale: 1 }) },
  })('features/request-detail/RequestDecisionVehiclePicker.tsx');
  t.after(() => hooks.unmount());
  const render = () => hooks.render(() => RequestDecisionVehiclePicker({ model: f.model, disabled: f.disabled }));
  const list = tree => elements(tree).find(item => item.type === 'FlatList');
  const options = tree => list(tree)?.props.data.map((item, index) => list(tree).props.renderItem({ item, index })) ?? [];
  const toggle = () => elements(render()).find(item => item.type === 'Pressable').props.onPress();
  return { f, calls, render, list, options, toggle };
}

test('one vehicle is displayed without another selection step and no arbitrary vehicle is chosen', t => {
  const f = picker(t, [vehicle('one')]);
  f.f.model.directAcceptVehicleId = 'one';
  const tree = f.render();
  assert.match(words(tree), /Votre véhicule.*Modèle one.*TEST-one/);
  assert.equal(f.list(tree), undefined);
  assert.equal(elements(tree).some(item => item.type === 'Pressable'), false);
  assert.deepEqual(f.calls, [], 'existing availability logic owns automatic single-vehicle selection');
});

test('multiple vehicles start collapsed; opening and choosing closes the list and preserves Change', t => {
  const f = picker(t);
  let tree = f.render();
  assert.match(words(tree), /Choisir mon véhicule.*Pour accepter la demande/);
  assert.equal(f.list(tree), undefined, 'the fleet does not take space from the route until requested');
  const choose = elements(tree).find(item => item.type === 'Pressable');
  assert.equal(choose.props.accessibilityState.expanded, false);
  assert.match(choose.props.accessibilityLabel, /Choisir mon véhicule pour accepter/);
  assert.deepEqual(f.calls, [], 'do not select an arbitrary vehicle to save space');
  f.toggle(); tree = f.render();
  assert.match(words(tree), /Fermer/);
  assert.equal(f.options(tree).length, 2); assert.deepEqual(f.calls, []);
  f.options(tree)[1].props.onPress(); tree = f.render();
  assert.deepEqual(f.calls, ['two']); assert.equal(f.list(tree), undefined);
  assert.match(words(tree), /Modèle two.*TEST-two.*Changer/);
  const change = elements(tree).find(item => item.type === 'Pressable');
  assert.equal(change.props.accessibilityState.expanded, false);
  change.props.onPress(); tree = f.render();
  assert.equal(f.options(tree)[1].props.accessibilityState.checked, true);
  f.options(tree)[0].props.onPress(); assert.equal(f.list(f.render()), undefined);
  assert.deepEqual(f.calls, ['two', 'one']);
});

test('a large fleet uses a bounded list even on a short screen and keeps full vehicle identities', t => {
  const f = picker(t, Array.from({ length: 30 }, (_, i) => vehicle(String(i))));
  f.f.height = 360;
  assert.equal(f.list(f.render()), undefined);
  f.toggle();
  const tree = f.render(), list = f.list(tree);
  assert.equal(list.props.style.maxHeight, 72);
  assert.equal(list.props.initialNumToRender, 3); assert.equal(list.props.removeClippedSubviews, false);
  assert.equal(list.props.data.length, 30, 'all compatible vehicles remain selectable');
  const last = f.options(tree).at(-1);
  assert.match(last.props.accessibilityLabel, /Modèle 29, TEST-29/);
  assert.equal(last.props.accessibilityRole, 'radio');
  assert.equal(elements(last).filter(item => item.type === 'Text').some(item => item.props.numberOfLines), false);
});

test('busy choices cannot change the vehicle and a removed selection requires a fresh choice', t => {
  const f = picker(t); f.f.disabled = true;
  f.toggle(); assert.equal(f.list(f.render()), undefined, 'disabled picker cannot open');
  f.f.disabled = false; f.toggle();
  f.f.disabled = true;
  let tree = f.render();
  for (const option of f.options(tree)) {
    assert.equal(option.props.disabled, true); option.props.onPress();
  }
  assert.deepEqual(f.calls, []);
  f.f.disabled = false; f.options(f.render())[1].props.onPress(); tree = f.render();
  f.f.disabled = true;
  const change = elements(f.render()).find(item => item.type === 'Pressable'); change.props.onPress();
  assert.equal(f.list(f.render()), undefined);
  f.f.disabled = false;
  f.f.model.compatibleActiveVehicles = [vehicle('one'), vehicle('three')];
  assert.equal(f.list(f.render()), undefined, 'invalid selection must not automatically expand the footer');
  assert.match(words(f.render()), /Choisir mon véhicule/);
  f.toggle();
  assert.equal(f.options(f.render()).length, 2);
  assert.equal(f.options(f.render()).some(item => item.props.accessibilityState.checked), false);
});

test('expanded choices do not leak to another request or account', t => {
  const f = picker(t);
  f.toggle();
  f.options(f.render())[0].props.onPress();
  elements(f.render()).find(item => item.type === 'Pressable').props.onPress();
  assert.ok(f.list(f.render()));
  f.f.model.userId = 'other-driver'; f.f.model.tripRequest = { ...request, id: 'other-order' };
  assert.equal(f.list(f.render()), undefined);
});

test('the fleet can be closed without selecting, and reopening preserves the current vehicle', t => {
  const f = picker(t);
  f.toggle(); assert.ok(f.list(f.render()));
  f.toggle(); assert.equal(f.list(f.render()), undefined);
  assert.deepEqual(f.calls, []);
  f.toggle(); f.options(f.render())[1].props.onPress();
  f.toggle(); f.toggle();
  assert.equal(f.f.model.directAcceptVehicleId, 'two');
  assert.equal(f.list(f.render()), undefined);
  assert.match(words(f.render()), /Modèle two.*TEST-two.*Changer/);
  assert.deepEqual(f.calls, ['two']);
});

test('no vehicle leaves no empty selector, and a single compatible vehicle never renders a list', t => {
  const f = picker(t, []);
  assert.equal(f.render(), null);
  f.f.model.compatibleActiveVehicles = [vehicle('only')];
  assert.equal(f.list(f.render()), undefined);
  assert.match(words(f.render()), /TEST-only/);
  assert.deepEqual(f.calls, []);
});

test('compact summary preserves route landmarks, budget, payment, contact and commission outside the vehicle picker', () => {
  const { RequestDriverDecision } = loader(mocks)('features/request-detail/RequestDriverDecision.tsx');
  const tree = RequestDriverDecision({ model, presentation });
  const route = elements(tree).find(item => item.type === 'Route');
  assert.equal(route.props.compact, true); assert.equal(route.props.labels, labels);
  for (const value of ['Passager test', '2 000 FC', 'Budget par place', 'Cash à l’arrivée']) assert.ok(words(tree).includes(value), value);
  assert.match(words(tree), /2\s+place\s*s/);
  assert.equal(elements(tree).find(item => item.type === 'Commission').props.amount, 4000);
  assert.equal(elements(tree).find(item => item.type === 'Contact').props.requestId, request.id);
  assert.equal(elements(tree).some(item => item.type === 'VehiclePicker'), false);
  assert.doesNotMatch(words(tree), /Pouvez-vous le prendre|Quel véhicule utilisez-vous/);
});

test('driver decision opens with a generous route overview and keeps optional settings inline', () => {
  const { RequestDriverDecision } = loader(mocks)('features/request-detail/RequestDriverDecision.tsx');
  const tree = RequestDriverDecision({ model, presentation });
  const map = elements(tree).find(item => item.type === 'RouteMap');
  assert.equal(map.props.displayMode, 'overview'); assert.equal(map.props.variant, 'light');
  assert.equal(map.props.overviewHeight, 295);
  assert.ok(elements(tree.props.children[0]).includes(map), 'map leads the content instead of sitting below all details');
  assert.equal(map.props.mapData, presentation.requestRouteMapData);
  assert.equal(map.props.routeCoordinates, presentation.displayedRouteCoordinates);
  assert.equal(map.props.departureName, labels.departure.title);
  assert.equal(map.props.arrivalName, labels.arrival.title);
  assert.equal(map.props.summary, undefined, 'no duplicate departure/arrival legend or extra map heading');
  assert.equal(elements(tree).find(item => item.type === 'Options').props.model, model);
  assert.equal(elements(tree).some(item => item.props.onPress === model.handleOpenDirectAcceptModal && item.type === 'Pressable'), false);
  const next = RequestDriverDecision({ model: { ...model, tripRequest: { ...request, id: 'next' } }, presentation });
  assert.notEqual(elements(next).find(item => item.type === 'RouteMap').key, map.key, 'route cache state cannot leak between requests');
});

test('overview adapts to short and tall screens without changing the passenger endpoints', () => {
  for (const [height, expected] of [[568, 200], [800, 280], [1200, 360]]) {
    const { RequestDriverDecision } = loader({ ...mocks,
      'react-native': { ...native, useWindowDimensions: () => ({ height, width: 390 }) },
    })('features/request-detail/RequestDriverDecision.tsx');
    const map = elements(RequestDriverDecision({ model, presentation })).find(item => item.type === 'RouteMap');
    assert.equal(map.props.overviewHeight, expected);
    assert.equal(map.props.mapData, presentation.requestRouteMapData);
  }
});

test('vehicle selection and both response buttons share the non-shrinking footer; eligibility remains enforced', () => {
  const { RequestDecisionActions } = loader(mocks)('features/request-detail/RequestDriverDecision.tsx');
  let tree = RequestDecisionActions({ model });
  assert.equal(tree.props.style.flexShrink, 0);
  assert.ok(elements(tree).some(item => item.type === 'VehiclePicker'));
  const accept = item => elements(item).find(element => element.type === 'Pressable' && words(element) === 'Accepter');
  assert.equal(accept(tree).props.disabled, true, 'no acceptance without selected vehicle');
  tree = RequestDecisionActions({ model: { ...model, directAcceptVehicle: vehicle('one') } });
  assert.equal(accept(tree).props.disabled, false);
  tree = RequestDecisionActions({ model: { ...model, isIdentityVerified: false, canAcceptDirectly: false } });
  assert.match(words(tree), /Vérifier mon identité/); assert.equal(accept(tree).props.disabled, true);
  assert.equal(elements(tree).some(item => item.type === 'VehiclePicker'), false);
  tree = RequestDecisionActions({ model: { ...model, compatibleActiveVehicles: [], canAcceptDirectly: false } });
  assert.match(words(tree), /Aucun véhicule compatible/); assert.equal(accept(tree).props.disabled, true);
});

test('actual request screen keeps the decision footer outside the scrollable details', () => {
  const Screen = loader({ ...mocks,
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@/hooks/useMainScreenReady': { useMainScreenReady: () => () => {} },
    '@/features/request-detail/SharedTripPanel': { SharedTripPanel: 'SharedTripPanel' },
    '@/features/request-detail/RequestSearchScreen': { RequestSearchScreen: 'RequestSearchScreen' },
    '@/store/api/sharedTripApi': { useSharedTripContextQuery: () => ({}) },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: () => true, displayReadOptions: () => ({}) },
    '@/services/rideAlertSession': { acknowledgeRideAlerts: () => {} },
    '../../hooks/request-detail/useRequestDetailController': { useRequestDetailController: () => model },
    '../../features/request-detail/requestPresentation': { buildRequestDetailPresentation: () => presentation },
    '../../features/request-detail/RequestDriverSummary': { RequestDriverSummary: 'LegacySummary' },
    '@/features/request-detail/RequestPassengerTicket': { RequestPassengerTicket: 'Ticket', RequestPassengerActions: 'PassengerActions' },
    '@/features/request-detail/RequestDriverCourse': { RequestDriverCourse: 'Course', RequestCourseActions: 'CourseActions' },
    '@/features/request-detail/RequestDriverDecision': { RequestDriverDecision: 'Decision', RequestDecisionActions: 'DecisionActions' },
    '../../features/request-detail/RequestEditModal': { RequestEditModal: 'EditModal' },
    '../../features/request-detail/RequestAcceptModal': { RequestAcceptModal: 'AcceptModal' },
    '../../features/screen-styles/app/request/detail/index': { styles: {} },
    '@/components/LocationPickerModal': { __esModule: true, default: 'Picker' },
  })('app/request/[id].tsx').default;
  const tree = Screen();
  const scroll = elements(tree).find(item => item.type === 'ScrollView');
  assert.equal(scroll.props.style.flex, 1);
  assert.equal(scroll.props.style.minHeight, 0);
  assert.ok(elements(scroll).some(item => item.type === 'Decision'));
  assert.equal(elements(scroll).some(item => item.type === 'DecisionActions'), false);
  assert.ok(tree.props.children.some(item => item?.type === 'DecisionActions'));
  assert.equal(elements(scroll).find(item => item.type === 'Decision').props.presentation, presentation);
  assert.equal(elements(tree).some(item => item.type === 'AcceptModal'), false, 'no legacy acceptance modal in the decision path');
  assert.match(words(tree), /Nouvelle demande/);
  const previousRequest = model.tripRequest;
  try {
    model.tripRequest = { ...request, immediateDispatch: true };
    assert.ok(elements(Screen()).some(item => item.type === 'DecisionActions'), 'immediate requests also use the in-app accept/refuse footer');
    assert.ok(elements(Screen()).some(item => item.type === 'Decision'));
  } finally { model.tripRequest = previousRequest; }
  const previousId = model.userId;
  try {
    model.userId = request.passengerId;
    assert.equal(Screen().type, 'RequestSearchScreen', 'the same persisted detail route becomes the owner search map');
  } finally { model.userId = previousId; }
});
