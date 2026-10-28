const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements) : React.isValidElement(tree) ? [tree, ...elements(tree.props.children)] : [];
const words = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(words).join(' ') : words(tree?.props?.children ?? '');
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: x => x } };
const labels = { departure: { title: 'Départ test', address: 'Départ test', reference: 'Portail' }, arrival: { title: 'Arrivée test', address: 'Arrivée test', context: 'Quartier' } };
const mocks = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/hooks/request-detail/useRequestResponseWindow': { useRequestResponseWindow: () => ({ blocked: false, closed: false, label: null }) },
  './RequestTargetDriver': { RequestTargetDriver: 'RequestTargetDriver' },
  '@/hooks/useRouteLocationLabels': { useRouteLocationLabels: () => labels },
  '@/components/trip/RouteLocationDetails': { RouteLocationDetails: 'Route' },
  '@/features/navigation/NavigationContactModal': { NavigationContactModal: 'Contact' },
  './CollapsibleRouteMap': { CollapsibleRouteMap: 'RouteMap' }, './RequestPassengerContact': { RequestPassengerContact: 'PassengerContact' },
  '@/features/driver-payments/CashCommissionNotice': { CashCommissionNotice: 'Commission' },
};
const request = { id: 'order', passengerId: 'passenger', passengerName: 'Client test', status: 'pending', numberOfSeats: 2,
  departureDateMin: '2099-01-01T19:30:00', departureDateMax: '2099-01-01T20:00:00', maxPricePerSeat: 2000 };
const model = { tripRequest: request, requestedVehicleType: 'car', compatibleActiveVehicles: [], isIdentityVerified: true,
  canAcceptDirectly: true, directAcceptVehicle: { id: 'vehicle' }, canEdit: true, canCancel: true };
const presentation = { ownerDisplayedBudget: 2000, pendingOffersCount: 0, ownerHero: {}, displayedRouteCoordinates: [], requestRouteMapData: null };

test('passenger ticket uses real times, per-seat budget, references and actual expiration, with a collapsed map', () => {
  const { RequestPassengerTicket } = loader(mocks)('features/request-detail/RequestPassengerTicket.tsx');
  const tree = RequestPassengerTicket({ model, presentation });
  const routeMap = elements(tree).find(item => item.type === 'RouteMap');
  const text = words(tree) + ' ' + words(routeMap.props.summary);
  for (const value of ['19:30', '20:00', '23:00', 'Budget par place', '2 000 FC', 'Portail', 'Quartier', 'Recherche d’un conducteur']) assert.ok(text.includes(value), value);
  assert.equal(routeMap.props.initiallyExpanded, undefined);
  assert.doesNotMatch(text, /un à la fois|3 heures après|Étape/);
});

test('closed requests replace progress with their closed status; a selected driver does not imply departure', () => {
  const { RequestPassengerTicket } = loader(mocks)('features/request-detail/RequestPassengerTicket.tsx');
  const closed = RequestPassengerTicket({ model: { ...model, tripRequest: { ...request, status: 'expired' } },
    presentation: { ...presentation, ownerHero: { title: 'Commande expirée', subtitle: 'Choisissez une nouvelle heure.' } } });
  assert.match(words(closed), /Commande expirée/); assert.doesNotMatch(words(closed), /Recherche d’un conducteur/);
  const confirmed = RequestPassengerTicket({ model: { ...model, tripRequest: { ...request, status: 'driver_selected', tripId: 'trip' } }, presentation });
  const completedIcons = elements(confirmed).filter(item => item.type === 'Icon' && item.props.name === 'checkmark');
  assert.equal(completedIcons.length, 2, 'only sent/search stages complete, not departure');
});

test('passenger footer routes modify/cancel to existing actions and keeps assigned-trip access', () => {
  const calls = []; const { RequestPassengerActions } = loader(mocks)('features/request-detail/RequestPassengerTicket.tsx');
  let tree = RequestPassengerActions({ model: { ...model, handleCancelRequest: () => calls.push('cancel'), handleOpenEditForm: () => calls.push('edit') } });
  for (const button of elements(tree).filter(item => item.type === 'Pressable')) button.props.onPress();
  assert.deepEqual(calls, ['cancel', 'edit']);
  tree = RequestPassengerActions({ model: { ...model, tripRequest: { ...request, tripId: 'trip' }, handleViewTrip: id => calls.push(id) } });
  elements(tree).find(item => item.type === 'Pressable' && words(item).includes('Voir mon trajet')).props.onPress();
  assert.equal(calls.at(-1), 'trip'); assert.doesNotMatch(words(tree), /Modifier la commande/);
  tree = RequestPassengerActions({ model: { ...model, isFetchingRequest: true } });
  assert.ok(elements(tree).filter(item => item.type === 'Pressable').every(item => !item.props.disabled));
});

test('driver response footer accepts without another modal, refuses locally and disables while sending or selecting a vehicle', () => {
  const calls = []; const { RequestDecisionActions } = loader(mocks)('features/request-detail/RequestDriverDecision.tsx');
  const actions = { ...model, handleDirectAcceptTripRequest: (...args) => calls.push(['accept', ...args]), handleDeclineTripRequest: () => calls.push(['decline']) };
  const buttons = elements(RequestDecisionActions({ model: actions })).filter(item => item.type === 'Pressable');
  buttons[1].props.onPress(); buttons[0].props.onPress();
  assert.deepEqual(calls, [['accept', false, true], ['decline']]);
  for (const patch of [{ isAcceptingTripRequest: true }, { isFetchingRequest: true }, { directAcceptVehicle: null }]) {
    const accept = elements(RequestDecisionActions({ model: { ...actions, ...patch } })).filter(item => item.type === 'Pressable')[1];
    assert.equal(accept.props.disabled, true);
  }
});

test('driver confirmed course uses authorized contact and its actual pickup time, with a readable main action', () => {
  const hooks = hookHarness(); const module = loader({ ...mocks, react: { ...React, ...hooks.react } })('features/request-detail/RequestDriverCourse.tsx');
  const driver = { ...model, userId: 'driver', tripRequest: { ...request, selectedDriverId: 'driver', status: 'driver_selected', tripId: 'trip' },
    assignedTrip: { id: 'trip', departureTime: '2099-01-01T10:05:00', status: 'upcoming' } };
  const tree = hooks.render(() => module.RequestDriverCourse({ model: driver, presentation }));
  assert.match(words(tree), /COURSE CONFIRMÉE/); assert.match(words(tree), /10:05/);
  assert.equal(elements(tree).find(item => item.type === 'RouteMap').props.initiallyExpanded, true);
  const button = elements(tree).find(item => item.type === 'Pressable'); button.props.onPress();
  const updated = hooks.render(() => module.RequestDriverCourse({ model: driver, presentation }));
  assert.equal(elements(updated).find(item => item.type === 'Contact').props.contacts[0].id, 'passenger');
  assert.match(words(module.RequestCourseActions({ model: driver })), /Aller chercher le passager/);
  hooks.unmount();
});

test('route preview mounts no native map or route request until expanded and active', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(); let active = true, calls = 0;
  t.after(() => hooks.unmount());
  const { CollapsibleRouteMap } = loader({ 'react-native': { ...native, Platform: { OS: 'android' },
    InteractionManager: { runAfterInteractions: callback => { callback(); return { cancel() {} }; } } }, react: { ...React, ...hooks.react },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-maps': { __esModule: true, default: 'MapView', Marker: 'Marker', Polyline: 'Polyline' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/assets/images/map-markers/trip-detail-marker-departure.png': 'departure-image',
    '@/assets/images/map-markers/trip-detail-marker-arrival.png': 'arrival-image',
    '@/utils/routeApi': { getRouteCoordinates: async () => { calls++; return []; } },
  })('features/request-detail/CollapsibleRouteMap.tsx');
  const mapData = { departureCoordinate: { latitude: -4, longitude: 15 }, arrivalCoordinate: { latitude: -4.1, longitude: 15.1 }, fallbackCoordinates: [], initialRegion: {} };
  const render = () => hooks.render(() => CollapsibleRouteMap({ variant: 'light', mapData, routeCoordinates: [], departureName: 'Départ', arrivalName: 'Arrivée' }));
  let tree = render(); assert.equal(calls, 0); assert.equal(elements(tree).some(item => item.type === 'MapView'), false);
  elements(tree).find(item => item.type === 'Pressable').props.onPress();
  render(); t.mock.timers.tick(1); // Native map mounting waits until interactions finish.
  tree = render(); await Promise.resolve(); assert.equal(calls, 1); assert.equal(elements(tree).some(item => item.type === 'MapView'), true);
  active = false; tree = render(); assert.equal(elements(tree).some(item => item.type === 'MapView'), false); assert.equal(calls, 1);
});
