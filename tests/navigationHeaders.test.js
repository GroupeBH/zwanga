const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(words).join('') : node?.props ? words(node.props.children) : '';
const flatStyle = style => Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));
const native = { View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
  StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 320, height: 700 }) };
const insets = { top: 47, bottom: 34, left: 0, right: 0 };
const assistance = { enabled: true, panel: null, isOpen: false, openContacts() {}, openSos() {} };
const defaults = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/features/navigation/NavigationAssistanceButtons': { NavigationAssistanceButtons: 'AssistanceButtons' } };

function driverModel() {
  const foundation = {
    data: { insets, trip: { id: 'trip' }, tripId: 'trip', bookings: [{ id: 'booking' }], isTripOngoing: true,
      tripArrivalCoordinate: { latitude: -4.4, longitude: 15.3 }, isScreenActive: true },
    mapState: { waypoints: [], steps: [], currentStepIndex: 0, routeSectionFocus: 'next', isSocketConnected: true,
      currentLocation: { coords: { latitude: -4.3, longitude: 15.2, accuracy: 10 }, timestamp: 123 } },
    passengers: { passengerMapLocations: [] }, refs: { currentLocationRef: { current: null } },
    focusMapOnCoordinates() {}, exitActions: {},
  };
  return { session: { foundation }, presentation: { hasValidTripCoordinates: true, canToggleRouteSections: true,
    displayedDurationText: '37 min', displayedDistanceText: '12,6 km', displayedEtaText: '06:50' },
    passengerPresentation: {}, bookingActions: {}, tripActions: {}, interruptionActions: {}, pickupActions: {}, voice: {}, handleExitNavigation() {}, forceRecalculateRoute() {} };
}

test('driver header reserves safe-area space and puts confirmation outside the duration/distance block', () => {
  const { DriverNavigationTopPanel } = loader({ ...defaults,
    '@/features/ride-recovery/RideRecoveryControl': { RideRecoveryControl: 'Recovery' },
    './DriverNavigationPassengersBar': { DriverNavigationPassengersBar: 'Passengers' },
  })('features/driver-navigation/DriverNavigationTopPanel.tsx');
  const model = driverModel();
  const tree = DriverNavigationTopPanel({ model, assistance });
  assert.equal(flatStyle(tree.props.style).top, 55);
  const header = tree.props.children[0];
  assert.match(words(header), /37 min.*En direct.*12,6 km.*Arrivée à 06:50/);
  assert.equal(all(header).find(node => node.type === 'Recovery'), undefined);
  for (const text of all(header).filter(node => node.type === 'Text')) assert.equal(text.props.numberOfLines, undefined);
  const recovery = all(tree).find(node => node.type === 'Recovery');
  assert.equal(recovery.props.bookings, model.session.foundation.data.bookings);
  assert.equal(recovery.props.actor, 'driver'); assert.equal(recovery.props.compact, undefined);
  assert.equal(recovery.props.fix.recordedAt, 123); assert.equal(recovery.props.fix.accuracy, 10);
  const confirmation = all(tree).find(node => node.props?.children === recovery);
  const confirmationStyle = flatStyle(confirmation.props.style);
  assert.equal(confirmationStyle.backgroundColor, '#FFFFFF');
  assert.ok(confirmationStyle.padding >= 8);
  assert.ok(confirmationStyle.borderRadius > 0);
  assert.equal(confirmationStyle.height, undefined, 'allow confirmation and its hint to wrap with larger text');
  const buttons = all(tree).find(node => node.type === 'AssistanceButtons');
  assert.equal(buttons.props.role, 'driver'); assert.equal(buttons.props.onSos, assistance.openSos);
  assert.equal(buttons.props.onContact, assistance.openContacts);
  const scroll = all(tree).find(node => node.type === 'ScrollView');
  assert.equal(scroll.props.style.flexGrow, 0); assert.ok(scroll.props.style.maxHeight <= 210);
  model.session.foundation.data.offlineTrip = true;
  assert.match(words(DriverNavigationTopPanel({ model, assistance })), /Hors connexion/);
});

test('driver route selection and passenger actions keep their handlers in the new flowing header', () => {
  const load = loader({ ...defaults, '@/features/ride-recovery/RideRecoveryControl': { RideRecoveryControl: 'Recovery' },
    './DriverNavigationPassengersBar': { DriverNavigationPassengersBar: 'Passengers' } });
  const { DriverNavigationTopPanel } = load('features/driver-navigation/DriverNavigationTopPanel.tsx');
  const model = driverModel(); const selected = [];
  model.session.foundation.mapState.setRouteSectionFocus = section => selected.push(section);
  model.session.foundation.mapState.waypoints = [{ id: 'waypoint' }];
  const tree = DriverNavigationTopPanel({ model, assistance });
  all(tree).filter(node => node.type === 'Button' && ['Prochain arrêt', 'Reste du trajet'].includes(words(node))).forEach(button => button.props.onPress());
  assert.deepEqual(selected, ['next', 'remaining']);
  const passengers = all(tree).find(node => node.type === 'Passengers');
  assert.equal(passengers.props.foundation, model.session.foundation); assert.equal(passengers.props.bookingActions, model.bookingActions);
  const { styles } = load('features/screen-styles/app/trip/navigate/detail/passengerLocationMarker.styles.ts');
  assert.equal(styles.passengersBar.position, undefined); assert.equal(styles.passengersBar.top, undefined);
});

test('passenger header contact/SOS stays available with the expanded map and uses measured layout', () => {
  const { PassengerNavigationHeader } = loader(defaults)('features/passenger-navigation/PassengerNavigationHeader.tsx');
  const calls = [];
  const model = { data: { insets, trip: { driverName: 'Conducteur' } }, presentation: { tripStatus: 'in_transit' },
    state: { isMapExpanded: true, isSocketConnected: true, onHeaderLayout() {}, navigateBackSafely: () => calls.push('back') },
    tripActions: { handleShareTrip: () => calls.push('share') } };
  const tree = PassengerNavigationHeader({ model, assistance });
  assert.equal(tree.props.onLayout, model.state.onHeaderLayout);
  assert.equal(flatStyle(tree.props.style).paddingTop, 55);
  assert.match(words(tree), /En route.*En direct.*Votre conducteur.*Conducteur/);
  const buttons = all(tree).find(node => node.type === 'AssistanceButtons');
  assert.equal(buttons.props.role, 'passenger'); assert.equal(buttons.props.onContact, assistance.openContacts);
  assert.equal(buttons.props.onSos, assistance.openSos);
  all(tree).filter(node => node.type === 'Button').forEach(button => button.props.onPress());
  assert.deepEqual(calls, ['back', 'share']);
});

test('passenger map top offset follows actual header height, including larger text and orientation changes', () => {
  const hooks = hookHarness();
  const { usePassengerNavigationState } = loader({
    react: hooks.react, 'react-native': { BackHandler: { addEventListener: () => ({ remove() {} }) } },
    '../../features/passenger-navigation/navigationModel': { IS_ANDROID: false },
    '@/hooks/navigation/useNavigationMapLifecycle': { useNavigationMapLifecycle: () => ({}) },
    '@/hooks/navigation/useNavigationRequestGuard': { useNavigationRequestGuard: () => ({}) },
    '@/hooks/navigation/useNavigationMarkerRefresh': { useNavigationMarkerRefresh: () => ({}) },
    '@/store/api/googleMapsApi': { useGetDirectionsMutation: () => [() => {}] },
    '@/utils/navigationSpeech': { NavigationSpeech: { stop() {} } },
  })('hooks/passenger-navigation/usePassengerNavigationState.ts');
  const render = () => hooks.render(() => usePassengerNavigationState({ bookingId: 'b', isScreenActive: true, isTripOngoing: true, insets, router: {}, isFocused: false }));
  let state = render(); assert.equal(state.mapTopOffset, 187);
  const onHeaderLayout = state.onHeaderLayout;
  onHeaderLayout({ nativeEvent: { layout: { height: 208.3 } } }); state = render(); assert.equal(state.mapTopOffset, 209);
  assert.equal(state.onHeaderLayout, onHeaderLayout);
  onHeaderLayout({ nativeEvent: { layout: { height: 0 } } }); assert.equal(render().mapTopOffset, 209);
  onHeaderLayout({ nativeEvent: { layout: { height: 160 } } }); assert.equal(render().mapTopOffset, 160);
  hooks.unmount();
});

test('driver exposes icon-only rerouting directly and keeps my position in options', () => {
  const hooks = hookHarness(); const calls = [];
  const { DriverNavigationControls } = loader({ ...defaults, react: { ...React, ...hooks.react },
    '../screen-styles/app/trip/navigate/detail/index': { styles: {} },
    './navigationBooking': { normalizeDriverLocationObject: value => value },
  })('features/driver-navigation/DriverNavigationControls.tsx');
  const model = driverModel(); const foundation = model.session.foundation;
  foundation.mapState.setSecurityModalVisible = () => calls.push('security');
  foundation.passengers.passengerMapLocations = [{}];
  foundation.focusMapOnCoordinates = (...args) => calls.push(args);
  const props = { foundation, forceRecalculateRoute: () => calls.push('recalculate'), voice: { toggleVoiceGuidance: () => calls.push('voice') },
    tripActions: { handleEditTripFromNavigation: () => calls.push('edit'), handlePauseTripFromNavigation: () => calls.push('pause'), handleShareTrip: async () => calls.push('share') },
    passengerPresentation: { fitVehicleAndPassengers: () => calls.push('passengers') } };
  let tree; const render = () => { tree = hooks.render(() => DriverNavigationControls(props)); };
  const button = label => all(tree).find(node => node.type === 'Button' && node.props.accessibilityLabel === label);
  render(); assert.equal(all(tree).filter(node => node.type === 'Button').length, 4);
  const rerouteLabel = 'Recalculer l’itinéraire';
  assert.equal(words(button(rerouteLabel)), '', 'keep an accessible label without visible caption');
  assert.equal(all(button(rerouteLabel)).find(node => node.type === 'Icon').props.name, 'refresh');
  assert.equal(button('Recentrer sur ma position'), undefined);
  assert.equal(button('Ma position'), undefined);
  button('Demander une interruption du trajet').props.onPress();
  button('Activer le guidage vocal').props.onPress();
  for (const [label, result] of [['Prévenir mes proches', 'security'], ['Modifier le trajet', 'edit'], ['Partager le trajet', 'share'], ['Voir les passagers', 'passengers']]) {
    button('Options de navigation').props.onPress(); render(); button(label).props.onPress(); render();
    assert.equal(calls.at(-1), result); assert.equal(button(label), undefined);
  }
  assert.deepEqual(calls.slice(0, 2), ['pause', 'voice']);
  button(rerouteLabel).props.onPress(); render(); assert.equal(calls.at(-1), 'recalculate');
  button('Options de navigation').props.onPress(); render(); button('Ma position').props.onPress(); render();
  assert.deepEqual(calls.at(-1)[0], [{ latitude: -4.3, longitude: 15.2 }]);
  assert.equal(calls.at(-1)[1].logContext, 'recenter-driver');
  foundation.data.isCreatingTripShareLink = true; foundation.mapState.isLoadingRoute = true;
  foundation.data.isRequestingDriverInterruption = true; button('Options de navigation').props.onPress(); render();
  const popup = tree.props.children[0];
  const popupStyle = flatStyle(popup.props.style); const frame = flatStyle(tree.props.style);
  assert.ok(frame.width >= popupStyle.width + popupStyle.right);
  assert.ok(frame.minHeight >= popupStyle.maxHeight);
  assert.equal(button('Partager le trajet').props.disabled, true);
  assert.equal(button(rerouteLabel).props.disabled, true);
  assert.equal(button(rerouteLabel).props.accessibilityState.busy, true);
  assert.ok(all(button(rerouteLabel)).find(node => node.type === 'Spinner'));
  const loadingCount = calls.length;
  button(rerouteLabel).props.onPress(); assert.equal(calls.length, loadingCount);
  assert.ok(!button('Ma position').props.disabled);
  const latestPosition = { coords: { latitude: -4.31, longitude: 15.21 } };
  foundation.refs.currentLocationRef.current = latestPosition;
  button('Ma position').props.onPress(); render();
  assert.equal(button('Ma position'), undefined);
  assert.deepEqual(calls.at(-1)[0], [{ latitude: -4.31, longitude: 15.21 }]);
  assert.equal(calls.at(-1)[1].logContext, 'recenter-driver');
  const count = calls.length;
  foundation.refs.currentLocationRef.current = null; foundation.mapState.currentLocation = null;
  button('Options de navigation').props.onPress(); render();
  button('Ma position').props.onPress(); render(); assert.equal(calls.length, count);
  foundation.refs.currentLocationRef.current = latestPosition;
  assert.equal(button('Demander une interruption du trajet').props.disabled, true);
  button('Options de navigation').props.onPress(); render();
  const staleRecenter = button('Ma position').props.onPress;
  foundation.mapState.isLoadingRoute = false;
  foundation.data.isScreenActive = false; render(); render(); assert.equal(button('Partager le trajet'), undefined);
  assert.equal(button(rerouteLabel).props.disabled, true);
  button(rerouteLabel).props.onPress(); staleRecenter(); assert.equal(calls.length, count);
  hooks.unmount();
});

test('driver navigation wires contacts to this trip and defers automatic notice modals during assistance', () => {
  const model = driverModel(); const received = [];
  const mocked = { ...defaults,
    '../../../hooks/driver-navigation/useDriverNavigationController': { useDriverNavigationController: () => model },
    '@/hooks/navigation/useNavigationAssistance': { useNavigationAssistance: value => { received.push(value); return { ...assistance, isOpen: true, panel: 'sos' }; } },
    '@/features/driver-navigation/DriverNavigationTopPanel': { DriverNavigationTopPanel: 'TopPanel' },
    '@/features/navigation/NavigationAssistanceModals': { NavigationAssistanceModals: 'AssistanceModals' },
    '../../../features/screen-styles/app/trip/navigate/detail/index': { styles: {} },
    '../../../features/driver-navigation/navigationModel': { KINSHASA_FALLBACK_MAP_COORDINATE: { latitude: -4.3, longitude: 15.2 } },
    '../../../features/driver-navigation/navigationPresentation': { cleanHtmlInstructions: value => value },
  };
  const components = ['DriverNavigationControls', 'DriverNavigationMap', 'NavigationLocationDisclosure', 'NavigationPassengersModal', 'NavigationPickupBypassModal', 'NavigationSecurityModal', 'NavigationWaypointModal', 'NavigationPickupNoticeModal', 'NavigationTripEndModal'];
  components.forEach(name => { mocked[`../../../features/driver-navigation/${name}`] = { [name]: name }; });
  const screen = loader(mocked)('app/trip/navigate/[id].tsx').default;
  const tree = screen(); assert.equal(received[0].role, 'driver'); assert.equal(received[0].bookings, model.session.foundation.data.bookings);
  assert.equal(all(tree).find(node => node.type === 'DriverNavigationControls').props.forceRecalculateRoute, model.forceRecalculateRoute);
  for (const type of ['NavigationPassengersModal', 'NavigationPickupBypassModal', 'NavigationWaypointModal', 'NavigationPickupNoticeModal', 'NavigationTripEndModal']) {
    assert.equal(all(tree).find(node => node.type === type).props.securityModalVisible, true);
  }
  assert.equal(all(tree).find(node => node.type === 'AssistanceModals').props.role, 'driver');
});

test('passenger navigation wires its own booking, keeps contacts on expanded map and defers pickup notices', () => {
  const received = [];
  const model = { data: { trip: { id: 't', departure: { address: 'Départ' } }, booking: { id: 'b', tripId: 't' }, insets, isScreenActive: true },
    state: { isMapExpanded: true, mapTopOffset: 200, pickupNotice: {}, setPickupNotice() {} }, presentation: {}, context: {}, tripActions: {}, camera: {} };
  const mocked = { ...defaults,
    '../../../hooks/passenger-navigation/usePassengerNavigationController': { usePassengerNavigationController: () => model },
    '../../../features/passenger-navigation/PassengerNavigationMap': { PassengerNavigationMap: 'Map' },
    '../../../features/passenger-navigation/PassengerNavigationInfoCard': { PassengerNavigationInfoCard: 'InfoCard' },
    '@/features/passenger-navigation/PassengerNavigationHeader': { PassengerNavigationHeader: 'Header' },
    '../../../features/screen-styles/app/booking/navigate/detail/index': { styles: {} },
    '@/features/navigation/NavigationAssistanceModals': { NavigationAssistanceModals: 'AssistanceModals' },
    '@/hooks/navigation/useNavigationAssistance': { useNavigationAssistance: value => { received.push(value); return { ...assistance, isOpen: true }; } },
    'react-native': { ...native, Modal: 'Modal' },
  };
  const tree = loader(mocked)('app/booking/navigate/[id].tsx').default();
  assert.equal(received[0].role, 'passenger'); assert.equal(received[0].booking, model.data.booking);
  assert.ok(all(tree).find(node => node.type === 'Header')); assert.equal(all(tree).find(node => node.type === 'InfoCard'), undefined);
  assert.equal(all(tree).find(node => node.type === 'Modal').props.visible, false);
  assert.equal(all(tree).find(node => node.type === 'AssistanceModals').props.role, 'passenger');
});
