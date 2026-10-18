const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children), ...all(node.props?.secondaryActions)];
const words = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(words).join('') : node?.props ? words(node.props.children) : '';
const flatStyle = style => Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));
const native = { View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
  StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 320, height: 700 }) };
const insets = { top: 47, bottom: 34, left: 0, right: 0 };
const assistance = { enabled: true, panel: null, isOpen: false, openContacts() {}, openContact() {}, openSos() {} };
const defaults = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/components/trip/TripShareAction': { TripShareAction: 'ShareAction' },
  './DriverDropoffReceipts': { DriverDropoffReceipts: 'DropoffReceipts' },
  './DriverDropoffReceiptsSheet': { DriverDropoffReceiptsSheet: 'ReceiptsSheet' },
  '@/features/navigation/RideModal': { RideModal: 'Modal' },
  '@/features/ride-recovery/RideActionResult': { RideActionResult: 'RideResult' },
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
    passengerPresentation: {}, bookingActions: {}, tripActions: {}, interruptionActions: {}, pickupActions: {}, voice: {},
    routeFormatting: { getManeuverIcon: () => 'navigate' }, handleExitNavigation() {}, forceRecalculateRoute() {} };
}

test('driver header reserves safe-area space and puts confirmation outside the duration/distance block', () => {
  const { DriverNavigationTopPanel } = loader({ ...defaults,
    '@/features/ride-recovery/RideRecoveryControl': { RideRecoveryControl: 'Recovery' },
    './DriverNavigationPassengersBar': { DriverNavigationPassengersBar: 'Passengers' },
  })('features/driver-navigation/DriverNavigationTopPanel.tsx');
  const model = driverModel();
  model.session.foundation.mapState.currentWaypointIndex = 0;
  model.session.foundation.mapState.waypoints = [{ booking: { id: 'next-passenger' }, type: 'pickup', completed: false }];
  const tree = DriverNavigationTopPanel({ model, assistance });
  assert.equal(flatStyle(tree.props.style).top, 55);
  const header = tree.props.children[0];
  assert.match(words(header), /Trajet en cours.*Connecté.*37 min.*12,6 km/);
  assert.equal(all(header).find(node => node.type === 'Recovery'), undefined);
  for (const text of all(header).filter(node => node.type === 'Text')) assert.equal(text.props.numberOfLines, undefined);
  const recovery = all(tree).find(node => node.type === 'Recovery');
  assert.equal(recovery.props.bookings, model.session.foundation.data.bookings);
  assert.equal(recovery.props.actor, 'driver'); assert.equal(recovery.props.compact, undefined);
  assert.equal(recovery.props.condensed, true);
  assert.equal(recovery.props.preferredBookingId, 'next-passenger');
  assert.equal(recovery.props.preferredStage, 'pickup');
  assert.equal(recovery.props.fix.recordedAt, 123); assert.equal(recovery.props.fix.accuracy, 10);
  const confirmation = all(tree).find(node => node.props?.children === recovery);
  const confirmationStyle = flatStyle(confirmation.props.style);
  assert.equal(confirmationStyle.flexShrink, 0);
  assert.equal(recovery.props.driverNavigation, true);
  assert.equal(confirmationStyle.height, undefined, 'allow confirmation and its hint to wrap with larger text');
  const buttons = all(tree).find(node => node.type === 'AssistanceButtons');
  assert.equal(buttons.props.role, 'driver'); assert.equal(buttons.props.onSos, assistance.openSos);
  assert.equal(buttons.props.onContact, assistance.openContacts);
  const contacted = [];
  model.session.foundation.mapState.waypoints[0].booking.passengerId = 'next-holder';
  const normal = all(DriverNavigationTopPanel({ model, assistance: { ...assistance, openContact: id => contacted.push(id) } })).find(n => n.type === 'Recovery');
  normal.props.secondaryActions.props.onContact();
  assert.deepEqual(contacted, ['next-holder']);
  model.session.foundation.passengers.activePendingBooking = { id: 'new-request' };
  const incoming = all(DriverNavigationTopPanel({ model, assistance })).find(n => n.type === 'Recovery');
  assert.equal(incoming.props.driverOverviewOnly, true);
  assert.equal(incoming.props.secondaryActions.props.onContact, assistance.openContacts);
  model.session.foundation.passengers.activePendingBooking = undefined;
  const scroll = all(tree).find(node => node.type === 'ScrollView');
  assert.equal(all(scroll).find(node => node.type === 'Recovery'), undefined, 'keep confirmations outside the bounded details');
  assert.equal(all(tree).find(node => node.type === 'DropoffReceipts'), undefined, 'in-progress gains stay in Options');
  assert.equal(flatStyle(scroll.props.style).flexGrow, 0); assert.equal(flatStyle(scroll.props.style).flexShrink, 1);
  assert.equal(flatStyle(scroll.props.style).minHeight, 64, 'the next stop never collapses to zero height');
  assert.ok(flatStyle(tree.props.style).maxHeight <= 340, 'the ordinary top panel leaves map space');
  model.session.foundation.mapState.waypoints[0].completed = true;
  const completedStop = all(DriverNavigationTopPanel({ model, assistance })).find(node => node.type === 'Recovery');
  assert.equal(completedStop.props.preferredBookingId, undefined);
  assert.equal(completedStop.props.preferredStage, undefined);
  model.session.foundation.data.trip.status = 'completed';
  model.session.foundation.data.isTripOngoing = false;
  const receipts = all(DriverNavigationTopPanel({ model, assistance })).find(node => node.type === 'DropoffReceipts');
  assert.equal(receipts.props.bookings, model.session.foundation.data.bookings);
  assert.equal(receipts.props.active, true);
  model.session.foundation.data.offlineTrip = true;
  assert.match(words(DriverNavigationTopPanel({ model, assistance })), /Sans connexion/);
});

test('driver header retains passenger actions without permanent route selection buttons', () => {
  const load = loader({ ...defaults, '@/features/ride-recovery/RideRecoveryControl': { RideRecoveryControl: 'Recovery' },
    './DriverNavigationPassengersBar': { DriverNavigationPassengersBar: 'Passengers' } });
  const { DriverNavigationTopPanel } = load('features/driver-navigation/DriverNavigationTopPanel.tsx');
  const model = driverModel();
  model.session.foundation.mapState.waypoints = [{ id: 'waypoint' }];
  const tree = DriverNavigationTopPanel({ model, assistance });
  assert.equal(all(tree).filter(node => node.type === 'Button' && ['Prochain arrêt', 'Reste du trajet'].includes(words(node))).length, 0);
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
  assert.match(words(tree), /En route.*Connecté.*Votre conducteur.*Conducteur/);
  const buttons = all(tree).find(node => node.type === 'AssistanceButtons');
  assert.equal(buttons.props.role, 'passenger'); assert.equal(buttons.props.onContact, assistance.openContacts);
  assert.equal(buttons.props.onSos, assistance.openSos);
  all(tree).filter(node => node.type === 'Button').forEach(button => button.props.onPress());
  all(tree).find(node => node.type === 'ShareAction').props.onShare();
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

test('stop and sharing are directly visible with location and Plus, retaining guards and touch bounds', () => {
  const hooks = hookHarness(); const calls = [];
  const { DriverNavigationControls } = loader({ ...defaults, react: { ...React, ...hooks.react },
    '../screen-styles/app/trip/navigate/detail/index': { styles: {} },
    './navigationBooking': { normalizeDriverLocationObject: value => value },
  })('features/driver-navigation/DriverNavigationControls.tsx');
  const foundation = driverModel().session.foundation;
  foundation.passengers.passengerMapLocations = [{}];
  foundation.mapState.setPassengersPanelVisible = value => calls.push(['stops', value]);
  foundation.focusMapOnCoordinates = (...args) => calls.push(args);
  const props = { foundation, forceRecalculateRoute: () => calls.push('recalculate'), voice: { toggleVoiceGuidance: () => calls.push('voice') },
    tripActions: { handleEditTripFromNavigation: () => calls.push('edit'), handlePauseTripFromNavigation: () => calls.push('pause'), handleShareTrip: async () => calls.push('share') },
    passengerPresentation: { passengerStats: { inVehicle: 0 }, fitVehicleAndPassengers: () => calls.push('passengers') } };
  let tree; const render = () => { tree = hooks.render(() => DriverNavigationControls(props)); };
  const button = label => all(tree).find(node => node.type === 'Button' && node.props.accessibilityLabel === label);
  const open = () => { (button('Options de navigation') ?? button('Fermer les options')).props.onPress(); render(); };
  render();
  assert.equal(all(tree).filter(node => node.type === 'Button').length, 4);
  assert.match(words(tree), /Ma position.*Partager le trajet.*Arrêter le trajet.*Plus/);
  const directButtons = all(tree).filter(node => node.type === 'Button');
  const directStyles = directButtons.map(button => flatStyle(button.props.style));
  assert.ok(directStyles.every(style => style.width >= 44 && style.minHeight >= 44));
  assert.equal(directStyles.reduce((sum, style) => sum + style.width, 0) + 3 * 8, flatStyle(tree.props.style).width);
  assert.ok(flatStyle(tree.props.style).width + flatStyle(tree.props.style).right <= 320 - 16);
  assert.equal(button('Mettre le trajet en pause'), undefined);
  assert.equal(button('Actualiser la route'), undefined);
  assert.equal(button('Activer le son'), undefined);
  button('Arrêter le trajet').props.onPress(); render();
  assert.equal(calls.pop(), 'pause', 'stop is directly available without opening Plus');
  button('Partager le trajet').props.onPress(); render();
  assert.equal(calls.pop(), 'share', 'sharing is directly available without opening Plus');
  open(); button('Activer le son').props.onPress(); render();
  button('Ma position').props.onPress();
  assert.equal(calls[0], 'voice');
  assert.deepEqual(calls[1][0], [{ latitude: -4.3, longitude: 15.2 }]);
  assert.equal(calls[1][1].logContext, 'recenter-driver');
  for (const [label, result] of [['Modifier le trajet', 'edit'],
    ['Passagers sur la carte', 'passengers'], ['Actualiser la route', 'recalculate']]) {
    open(); button(label).props.onPress(); render();
    assert.equal(calls.at(-1), result); assert.equal(button(label), undefined);
  }
  open(); button('Les arrêts').props.onPress(); render(); assert.deepEqual(calls.at(-1), ['stops', true]);
  props.passengerPresentation.passengerStats.inVehicle = 1;
  render(); assert.equal(button('Mettre le trajet en pause'), undefined);
  button('Arrêter le trajet').props.onPress(); render(); assert.equal(calls.at(-1), 'pause');
  foundation.passengers.activeDriverInterruptionRequest = { id: 'request' };
  render(); assert.ok(button('Voir la demande d’arrêt'));
  assert.match(words(button('Voir la demande d’arrêt')), /Arrêt demandé/);
  foundation.data.isCreatingTripShareLink = true; foundation.mapState.isLoadingRoute = true;
  foundation.data.isRequestingDriverInterruption = true;
  open();
  const popup = tree.props.children[0], popupStyle = flatStyle(popup.props.style), frame = flatStyle(tree.props.style);
  assert.ok(frame.width >= popupStyle.width + popupStyle.right);
  assert.ok(frame.minHeight >= popupStyle.maxHeight + popupStyle.bottom);
  for (const label of ['Partager le trajet', 'Actualiser la route', 'Voir la demande d’arrêt']) {
    assert.equal(button(label).props.disabled, true);
    const count = calls.length; button(label).props.onPress(); assert.equal(calls.length, count);
  }
  assert.equal(button('Actualiser la route').props.accessibilityState.busy, true);
  assert.ok(all(button('Actualiser la route')).find(node => node.type === 'Spinner'));
  const latest = { coords: { latitude: -4.31, longitude: 15.21 } };
  foundation.refs.currentLocationRef.current = latest;
  button('Ma position').props.onPress(); render();
  assert.deepEqual(calls.at(-1)[0], [{ latitude: -4.31, longitude: 15.21 }]);
  const count = calls.length;
  foundation.refs.currentLocationRef.current = null; foundation.mapState.currentLocation = null;
  button('Ma position').props.onPress(); assert.equal(calls.length, count);
  const staleRecenter = button('Ma position').props.onPress;
  const staleReroute = button('Actualiser la route').props.onPress;
  const staleStop = button('Voir la demande d’arrêt').props.onPress;
  const staleShare = button('Partager le trajet').props.onPress;
  foundation.refs.currentLocationRef.current = latest; foundation.mapState.isLoadingRoute = false;
  foundation.data.isScreenActive = false; render(); render();
  assert.equal(button('Partager le trajet').props.disabled, true);
  assert.equal(button('Ma position').props.disabled, true);
  assert.equal(button('Voir la demande d’arrêt').props.disabled, true);
  staleRecenter(); staleReroute(); staleStop(); staleShare(); assert.equal(calls.length, count);
  hooks.unmount();
});

test('driver can still access receipts through Options after hiding the banner, without automatic opening', () => {
  const hooks = hookHarness();
  const { DriverNavigationControls } = loader({ ...defaults, react: { ...React, ...hooks.react },
    '../screen-styles/app/trip/navigate/detail/index': { styles: {} },
    './navigationBooking': { normalizeDriverLocationObject: value => value },
  })('features/driver-navigation/DriverNavigationControls.tsx');
  const model = driverModel(), foundation = model.session.foundation;
  const props = { foundation, tripActions: {}, voice: {}, passengerPresentation: {}, forceRecalculateRoute() {} };
  const render = () => hooks.render(() => DriverNavigationControls(props));
  const find = type => all(render()).find(node => node.type === type);
  const button = label => all(render()).find(node => node.type === 'Button' && node.props.accessibilityLabel === label);
  button('Options de navigation').props.onPress();
  assert.equal(button('Mes gains'), undefined, 'no entry before the first dropoff');
  foundation.data.bookings = [{ id: 'completed', tripId: 'trip', status: 'completed' },
    { id: 'pending', tripId: 'trip', status: 'accepted' }, { id: 'elsewhere', tripId: 'other', status: 'completed' }];
  assert.equal(find('ReceiptsSheet'), undefined);
  button('Mes gains').props.onPress();
  assert.equal(button('Mes gains'), undefined, 'the options popup closes before opening the sheet');
  assert.equal(find('Modal').props.inApp, true);
  assert.equal(find('Modal').props.visible, true);
  assert.deepEqual(find('ReceiptsSheet').props.bookings.map(value => value.id), ['completed']);
  find('ReceiptsSheet').props.onClose(); assert.equal(find('ReceiptsSheet'), undefined);
  button('Options de navigation').props.onPress(); button('Mes gains').props.onPress();
  foundation.data.isScreenActive = false;
  assert.equal(find('ReceiptsSheet'), undefined);
  foundation.data.isScreenActive = true; assert.equal(find('ReceiptsSheet'), undefined);
  button('Options de navigation').props.onPress(); button('Mes gains').props.onPress();
  foundation.data.tripId = 'other';
  assert.equal(find('ReceiptsSheet'), undefined);
  foundation.data.tripId = 'trip'; assert.equal(find('ReceiptsSheet'), undefined);
  hooks.unmount();
});

test('driver navigation wires contacts to this trip and defers automatic notice modals during assistance', () => {
  const model = driverModel(); const received = [];
  const mocked = { ...defaults,
    '@/features/navigation/NavigationLoading': { NavigationLoading: 'NavigationLoading' },
    '@/components/trip/DriverTripAccessGuard': { DriverTripAccessGuard: 'DriverAccessGuard' },
    '@/features/navigation/RideOverlayProvider': { RideOverlayScope: 'RideOverlayScope' },
    '../../../hooks/driver-navigation/useDriverNavigationController': { useDriverNavigationController: () => model },
    '@/hooks/navigation/useNavigationAssistance': { useNavigationAssistance: value => { received.push(value); return { ...assistance, isOpen: true, panel: 'sos' }; } },
    '@/features/driver-navigation/DriverNavigationTopPanel': { DriverNavigationTopPanel: 'TopPanel' },
    '@/features/driver-navigation/DriverNavigationGuidance': { DriverNavigationGuidance: 'Guidance' },
    '@/features/navigation/NavigationAssistanceModals': { NavigationAssistanceModals: 'AssistanceModals' },
    '../../../features/screen-styles/app/trip/navigate/detail/index': { styles: {} },
    '../../../features/driver-navigation/navigationModel': { KINSHASA_FALLBACK_MAP_COORDINATE: { latitude: -4.3, longitude: 15.2 } },
    '../../../features/driver-navigation/navigationPresentation': { cleanHtmlInstructions: value => value },
  };
  const components = ['DriverNavigationControls', 'DriverNavigationMap', 'NavigationLocationDisclosure', 'NavigationPassengersModal', 'NavigationPickupBypassModal', 'NavigationSecurityModal', 'NavigationWaypointModal', 'NavigationPickupNoticeModal', 'NavigationTripEndModal'];
  components.forEach(name => { mocked[`../../../features/driver-navigation/${name}`] = { [name]: name }; });
  const screen = loader(mocked)('app/trip/navigate/[id].tsx').default;
  const guarded = screen();
  assert.equal(guarded.type, 'DriverAccessGuard');
  assert.equal(received.length, 0, 'driver controllers do not run before the access guard');
  const tree = guarded.props.children.type();
  assert.equal(received[0].role, 'driver'); assert.equal(received[0].bookings, model.session.foundation.data.bookings);
  assert.equal(all(tree).find(node => node.type === 'DriverNavigationControls').props.forceRecalculateRoute, model.forceRecalculateRoute);
  assert.equal(all(tree).find(node => node.type === 'DriverNavigationControls').props.canToggleRouteSections, true);
  assert.equal(all(tree).find(node => node.type === 'Guidance').props.getManeuverIcon, model.routeFormatting.getManeuverIcon);
  for (const type of ['NavigationPassengersModal', 'NavigationPickupBypassModal', 'NavigationWaypointModal', 'NavigationPickupNoticeModal', 'NavigationTripEndModal']) {
    assert.equal(all(tree).find(node => node.type === type).props.securityModalVisible, true);
  }
  assert.equal(all(tree).find(node => node.type === 'AssistanceModals').props.role, 'driver');
  const result = all(tree).find(node => node.type === 'RideResult');
  assert.equal(result.props.actor, 'driver'); assert.equal(result.props.tripId, 'trip'); assert.equal(result.props.active, true);
});

test('passenger navigation wires its own booking, keeps contacts on expanded map and defers pickup notices', () => {
  const received = [];
  const model = { data: { tripId: 't', bookingId: 'b', trip: { id: 't', departure: { address: 'Départ' } }, booking: { id: 'b', tripId: 't' }, insets, isScreenActive: true },
    state: { isMapExpanded: true, mapTopOffset: 200, pickupNotice: {}, setPickupNotice() {} }, presentation: {}, context: {}, tripActions: {}, camera: {} };
  const mocked = { ...defaults,
    '@/features/navigation/NavigationLoading': { NavigationLoading: 'NavigationLoading' },
    '@/features/navigation/RideOverlayProvider': { RideOverlayScope: 'RideOverlayScope' },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
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
  const result = all(tree).find(node => node.type === 'RideResult');
  assert.equal(result.props.actor, 'passenger'); assert.equal(result.props.bookingId, 'b'); assert.equal(result.props.tripId, 't');
});
