const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(words).join(' ') : words(node?.props?.children ?? '');
const flat = style => Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll', ActivityIndicator: 'Spinner',
  StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 320, height: 640 }) };
const base = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/features/request-detail/WithdrawRequestDriverButton': { TripDriverWithdrawal: 'DriverWithdrawal' },
  '../screen-styles/app/trip/navigate/detail/index': { styles: {} },
  './DriverInterruptionPrompt': { DriverInterruptionPrompt: 'Interruption' },
  './DriverPendingBookingPrompt': { DriverPendingBookingPrompt: 'Pending' },
};
const load = loader(base);
const { getDriverNavigationLayout } = load('features/driver-navigation/driverNavigationLayout.ts');

test('shared bounds reserve the map between top directions and bottom actions with safe areas', () => {
  for (const [height, top, bottom] of [[568, 20, 0], [640, 24, 24], [700, 47, 34], [852, 59, 34], [1024, 24, 20]]) {
    const layout = getDriverNavigationLayout(height, top, bottom);
    assert.equal(layout.guidanceTop, top + 8);
    assert.ok(layout.guidanceMaxHeight >= 64 && layout.guidanceMaxHeight <= 196);
    assert.ok(layout.controlsBottom >= bottom + 4);
    assert.ok(layout.panelBottom >= layout.controlsBottom + layout.controlsHeight);
    assert.ok(layout.guidanceTop + layout.guidanceMaxHeight + 24 <= height - layout.panelBottom - layout.priorityPanelMaxHeight + 0.01);
    assert.ok(layout.panelMaxHeight < layout.priorityPanelMaxHeight, 'reserve clear map space except for an urgent decision');
    assert.ok(layout.panelMaxHeight <= 292, 'ordinary navigation never takes more than 292 logical pixels');
    assert.equal(layout.controlsWidth, 120); assert.equal(layout.controlsHeight, 56);
  }
});

test('top guidance preserves full directions, metrics and a guarded return without confirming the trip', () => {
  const { DriverNavigationGuidance } = loader({ ...base, './navigationPresentation': { cleanHtmlInstructions: value => value.replace(/<[^>]*>/g, '') } })('features/driver-navigation/DriverNavigationGuidance.tsx');
  const calls = [];
  const props = { insets: { top: 24, bottom: 24, left: 20, right: 0 }, loading: false, rerouting: false,
    status: 'Trajet en cours', connection: 'Sans connexion', duration: '8 min', distance: '2,4 km', active: true, onExit: () => calls.push('exit'),
    assistanceEnabled: true, onSos: () => calls.push('sos'),
    step: { html_instructions: 'Tournez à <b>droite</b> sur une avenue très longue', distance: { text: '200 m' } },
    nextStep: { html_instructions: 'Continuez tout droit' }, getManeuverIcon: () => 'arrow-forward' };
  const tree = DriverNavigationGuidance(props);
  assert.match(words(tree), /200 m.*Tournez à droite sur une avenue très longue.*Puis :\s+Continuez tout droit/);
  assert.ok(all(tree).find(n => n.type === 'Scroll'));
  assert.ok(all(tree).filter(n => n.type === 'Text').every(n => n.props.numberOfLines === undefined));
  const layout = getDriverNavigationLayout(640, 24, 24);
  assert.equal(flat(tree.props.style).maxHeight, layout.guidanceMaxHeight);
  assert.equal(flat(tree.props.style).top, layout.guidanceTop);
  assert.equal(flat(tree.props.style).bottom, undefined);
  assert.equal(flat(tree.props.style).left, 20);
  const pending = DriverNavigationGuidance({ ...props, loading: true, rerouting: true });
  assert.match(words(pending), /Recalcul de l’itinéraire/);
  assert.doesNotMatch(words(pending), /Tournez/);
  assert.ok(all(pending).find(n => n.type === 'Spinner'));
  assert.match(words(tree), /Trajet en cours.*Sans connexion/);
  assert.match(words(tree), /8 min.*2,4 km/);
  all(tree).find(n => n.type === 'Button').props.onPress();
  assert.deepEqual(calls, ['exit']);
  all(DriverNavigationGuidance({ ...props, active: false })).find(n => n.type === 'Button').props.onPress();
  assert.deepEqual(calls, ['exit']);
  assert.match(words(DriverNavigationGuidance({ ...props, step: undefined })), /Guidage indisponible/);
  const sos = all(tree).find(n => n.props.accessibilityLabel?.startsWith('SOS'));
  assert.ok(flat(sos.props.style).minHeight >= 44);
  sos.props.onPress(); assert.deepEqual(calls, ['exit', 'sos']);
  const disabledSos = all(DriverNavigationGuidance({ ...props, assistanceEnabled: false })).find(n => n.props.accessibilityLabel?.startsWith('SOS'));
  assert.equal(disabledSos.props.disabled, true);
  disabledSos.props.onPress(); assert.deepEqual(calls, ['exit', 'sos']);
  const scroll = all(tree).find(n => n.type === 'Scroll');
  assert.ok(!all(scroll).includes(sos), 'SOS never scrolls away with directions');
  assert.doesNotMatch(words(scroll), /8 min/, 'remaining time stays fixed below long instructions');
});

test('portrait, landscape and large-text layout keep directions separate from the action dock', () => {
  for (const height of [360, 568, 640, 844]) for (const fontScale of [1, 1.5, 2]) {
    const layout = getDriverNavigationLayout(height, 24, 34, fontScale);
    const dockTop = height - layout.panelBottom - layout.panelMaxHeight;
    assert.ok(dockTop - layout.guidanceTop - layout.guidanceMaxHeight >= 48 - 0.01);
    assert.ok(layout.panelMaxHeight > 0);
    assert.ok(layout.panelBottom >= 34 + 56);
  }
});

test('next stop is readable without opening a modal or confirming anything', () => {
  const { DriverNavigationPassengersBar } = load('features/driver-navigation/DriverNavigationPassengersBar.tsx');
  for (const type of ['pickup', 'dropoff']) {
    const calls = [];
    const waypoint = { id: 'stop', type, address: 'Adresse du point de rendez-vous', passenger: { name: 'Passager test' }, completed: false };
    const foundation = { passengers: {}, data: {}, refs: { waypointModalVisibleRef: { current: false } },
      mapState: { waypoints: [waypoint], currentWaypointIndex: 0,
        setPassengersPanelVisible: value => calls.push(['passengers', value]),
        setActiveWaypoint: value => calls.push(['waypoint', value.id]), setWaypointModalVisible: value => calls.push(['open', value]) } };
    const props = { foundation, bookingActions: {}, passengerPresentation: { passengerStats: { totalPassengers: 3, inVehicle: 1, pendingPickups: 2 } } };
    const tree = DriverNavigationPassengersBar(props);
    assert.match(words(tree), type === 'pickup' ? /Allez chercher/ : /Emmenez le passager/);
    assert.match(words(tree), /Passager test.*Adresse du point de rendez-vous/);
    assert.doesNotMatch(words(tree), /Suivi actif/);
    const buttons = all(tree).filter(n => n.type === 'Button');
    assert.equal(buttons.length, 0, 'context does not open an intermediate screen');
    assert.ok(all(tree).filter(n => n.type === 'Text').every(n => !n.props.numberOfLines), 'full names and addresses stay readable');
    assert.deepEqual(calls, []);
    assert.equal(foundation.refs.waypointModalVisibleRef.current, false);
    waypoint.completed = true;
    assert.match(words(DriverNavigationPassengersBar(props)), /Allez à l’arrivée/);
    assert.equal(all(DriverNavigationPassengersBar(props)).filter(n => n.type === 'Button').length, 0);
    waypoint.completed = false;
    foundation.mapState.currentWaypointIndex = 1;
    const noCurrent = DriverNavigationPassengersBar(props);
    assert.match(words(noCurrent), /Vérifiez le prochain passager/);
    assert.match(words(noCurrent), /Les arrêts/);
    foundation.mapState.waypoints = [];
    assert.equal(all(DriverNavigationPassengersBar(props)).filter(n => n.type === 'Button').length, 0);
  }
});

test('route view choices move to Options without changing their handlers; a different trip closes Options', () => {
  const hooks = hookHarness(); const calls = [];
  const { DriverNavigationControls } = loader({ ...base, react: { ...React, ...hooks.react },
    './navigationBooking': { normalizeDriverLocationObject: value => value },
    './DriverDropoffReceiptsSheet': { DriverDropoffReceiptsSheet: 'Receipts' }, '@/features/navigation/RideModal': { RideModal: 'Modal' },
  })('features/driver-navigation/DriverNavigationControls.tsx');
  const foundation = { data: { insets: { top: 24, bottom: 24, left: 0, right: 0 }, tripId: 'trip', isScreenActive: true },
    passengers: { passengerMapLocations: [] }, mapState: { routeSectionFocus: 'next', setRouteSectionFocus: value => calls.push(value) } };
  const props = { foundation, tripActions: {}, voice: {}, passengerPresentation: {}, canToggleRouteSections: true };
  const render = () => hooks.render(() => DriverNavigationControls(props));
  const button = label => all(render()).find(n => n.type === 'Button' && n.props.accessibilityLabel === label);
  render();
  for (const [label, value] of [['Prochain arrêt', 'next'], ['Reste du trajet', 'remaining']]) {
    assert.equal(button(label), undefined);
    button('Options de navigation').props.onPress();
    assert.equal(button(label).props.accessibilityState.selected, value === 'next');
    button(label).props.onPress(); assert.equal(calls.at(-1), value);
  }
  props.canToggleRouteSections = false;
  button('Options de navigation').props.onPress(); assert.equal(button('Prochain arrêt'), undefined);
  foundation.data.tripId = 'another-trip'; render();
  assert.equal(button('Modifier le trajet'), undefined);
  hooks.unmount();
});

test('compact passenger summary limits map coverage but full address remains accessible without confirming', () => {
  const { DriverNavigationPassengersBar } = load('features/driver-navigation/DriverNavigationPassengersBar.tsx');
  const calls = [], next = { id: 'stop', type: 'pickup', passenger: { name: 'Nom long synthétique' }, address: 'Adresse complète très longue', completed: false };
  const foundation = { data: { isScreenActive: true }, passengers: {}, refs: { waypointModalVisibleRef: { current: false } },
    mapState: { waypoints: [next], currentWaypointIndex: 0, setActiveWaypoint: stop => calls.push(stop.id), setWaypointModalVisible: visible => calls.push(visible) } };
  const tree = DriverNavigationPassengersBar({ foundation, compact: true });
  assert.equal(tree.type, 'Button');
  assert.match(tree.props.accessibilityLabel, /Nom long synthétique.*Adresse complète très longue/);
  assert.deepEqual(all(tree).filter(n => n.type === 'Text').map(n => n.props.numberOfLines), [1, 2]);
  tree.props.onPress(); assert.deepEqual(calls, ['stop', true]);
  assert.equal(next.completed, false);
  foundation.data.isScreenActive = false;
  tree.props.onPress(); assert.equal(calls.length, 2);
});

test('a new reservation does not move/remount the ongoing confirmation control', () => {
  const hooks = hookHarness();
  const { DriverNavigationTopPanel } = loader({ ...base,
    '@/components/location/LocationAccessBanner': { LocationAccessBanner: 'LocationAccess' },
    react: { ...React, ...hooks.react },
    './DriverNavigationPassengersBar': { DriverNavigationPassengersBar: 'Passengers' },
    './DriverDropoffReceipts': { DriverDropoffReceipts: 'Receipts' },
    '@/features/ride-recovery/RideRecoveryControl': { RideRecoveryControl: 'Recovery' },
    '@/features/navigation/NavigationAssistanceButtons': { NavigationAssistanceButtons: 'Assistance' },
    '@/components/trip/TripShareAction': { TripShareAction: 'Share' },
  })('features/driver-navigation/DriverNavigationTopPanel.tsx');
  const foundation = { data: { insets: { top: 24, bottom: 24, left: 0, right: 0 }, tripId: 'trip', bookings: [{ id: 'active' }], isTripOngoing: true },
    passengers: {}, mapState: { waypoints: [] } };
  const props = { model: { session: { foundation }, presentation: {}, tripActions: {}, passengerPresentation: {}, bookingActions: {} }, assistance: {} };
  const render = () => hooks.render(() => DriverNavigationTopPanel(props));
  const ordinary = render();
  const recoveryParent = tree => all(tree).find(node => node.type === 'Scroll' && all(node).some(n => n.type === 'Recovery'));
  const index = recoveryParent(ordinary).props.children.findIndex(node => all(node).some(n => n.type === 'Recovery'));
  foundation.passengers.activePendingBooking = { id: 'new' };
  const pending = render();
  assert.ok(index >= 0);
  assert.ok(all(recoveryParent(pending).props.children[index]).find(n => n.type === 'Recovery'));
  assert.equal(recoveryParent(pending).props.children[index].type, recoveryParent(ordinary).props.children[index].type);
  assert.equal(all(pending).filter(n => n.type === 'Recovery').length, 1);
  foundation.passengers.activePendingBooking = undefined;
  foundation.data.bookings = [];
  assert.equal(all(render()).find(n => n.type === 'Recovery'), undefined);
  hooks.unmount();
});
