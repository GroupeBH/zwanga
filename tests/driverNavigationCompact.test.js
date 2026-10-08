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
  '../screen-styles/app/trip/navigate/detail/index': { styles: {} },
  './DriverInterruptionPrompt': { DriverInterruptionPrompt: 'Interruption' },
  './DriverPendingBookingPrompt': { DriverPendingBookingPrompt: 'Pending' },
};
const load = loader(base);
const { getDriverNavigationLayout } = load('features/driver-navigation/driverNavigationLayout.ts');

test('shared bounds separate guidance, commands and normal/priority panels with safe areas', () => {
  for (const [height, top, bottom] of [[568, 20, 0], [640, 24, 24], [700, 47, 34], [852, 59, 34], [1024, 24, 20]]) {
    const layout = getDriverNavigationLayout(height, top, bottom);
    assert.ok(layout.guidanceBottom >= bottom + 8);
    assert.ok(layout.guidanceMaxHeight >= 64 && layout.guidanceMaxHeight <= 124);
    assert.ok(layout.controlsBottom >= layout.guidanceBottom + layout.guidanceMaxHeight + 8);
    assert.ok(top + 8 + layout.priorityPanelMaxHeight + 12 <= height - layout.controlsBottom - 48 + 0.01);
    assert.ok(layout.panelMaxHeight < layout.priorityPanelMaxHeight, 'reserve clear map space except for an urgent decision');
    assert.equal(layout.controlsWidth, 216);
  }
});

test('guidance preserves full directions in a bounded scroll region above the home indicator', () => {
  const { DriverNavigationGuidance } = loader({ ...base, './navigationPresentation': { cleanHtmlInstructions: value => value.replace(/<[^>]*>/g, '') } })('features/driver-navigation/DriverNavigationGuidance.tsx');
  const props = { insets: { top: 24, bottom: 24, left: 20, right: 0 }, loading: false, rerouting: false,
    step: { html_instructions: 'Tournez à <b>droite</b> sur une avenue très longue', distance: { text: '200 m' } },
    nextStep: { html_instructions: 'Continuez tout droit' }, getManeuverIcon: () => 'arrow-forward' };
  const tree = DriverNavigationGuidance(props);
  assert.match(words(tree), /200 m.*Tournez à droite sur une avenue très longue.*Puis :\s+Continuez tout droit/);
  assert.ok(all(tree).find(n => n.type === 'Scroll'));
  assert.ok(all(tree).filter(n => n.type === 'Text').every(n => n.props.numberOfLines === undefined));
  const layout = getDriverNavigationLayout(640, 24, 24);
  assert.equal(flat(tree.props.style).maxHeight, layout.guidanceMaxHeight);
  assert.equal(flat(tree.props.style).bottom, layout.guidanceBottom);
  assert.equal(flat(tree.props.style).left, 20);
  const pending = DriverNavigationGuidance({ ...props, loading: true, rerouting: true });
  assert.match(words(pending), /Recalcul de l’itinéraire/);
  assert.doesNotMatch(words(pending), /Tournez/);
  assert.ok(all(pending).find(n => n.type === 'Spinner'));
  assert.equal(DriverNavigationGuidance({ ...props, step: undefined }), null);
});

test('next pickup or destination and the complete passenger list have distinct accessible actions', () => {
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
    assert.match(words(tree), type === 'pickup' ? /À récupérer/ : /Arrivée à destination/);
    assert.match(words(tree), /Passager test.*Adresse du point de rendez-vous.*Passagers.*1\s+à bord/);
    assert.doesNotMatch(words(tree), /Suivi actif/);
    const buttons = all(tree).filter(n => n.type === 'Button');
    assert.equal(buttons.length, 2);
    for (const button of buttons) { assert.ok(flat(button.props.style).minHeight >= 44); button.props.onPress(); }
    assert.match(buttons[0].props.accessibilityHint, /Ne valide pas l’étape/);
    assert.match(buttons[1].props.accessibilityLabel, /3 passagers, 1 à bord, 2 à récupérer/);
    assert.deepEqual(calls, [['waypoint', 'stop'], ['open', true], ['passengers', true]]);
    assert.equal(foundation.refs.waypointModalVisibleRef.current, true);
    waypoint.completed = true;
    assert.match(words(DriverNavigationPassengersBar(props)), /Arrêts effectués/);
    assert.equal(all(DriverNavigationPassengersBar(props)).filter(n => n.type === 'Button').length, 1);
    waypoint.completed = false;
    foundation.mapState.currentWaypointIndex = 1;
    const noCurrent = DriverNavigationPassengersBar(props);
    assert.match(words(noCurrent), /Vos arrêts/);
    assert.equal(all(noCurrent).find(n => n.type === 'Icon').props.name, 'list-outline');
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

test('a new reservation does not move/remount the ongoing confirmation control', () => {
  const { DriverNavigationTopPanel } = loader({ ...base,
    './DriverNavigationPassengersBar': { DriverNavigationPassengersBar: 'Passengers' },
    './DriverDropoffReceipts': { DriverDropoffReceipts: 'Receipts' },
    '@/features/ride-recovery/RideRecoveryControl': { RideRecoveryControl: 'Recovery' },
    '@/features/navigation/NavigationAssistanceButtons': { NavigationAssistanceButtons: 'Assistance' },
    '@/components/trip/TripShareAction': { TripShareAction: 'Share' },
  })('features/driver-navigation/DriverNavigationTopPanel.tsx');
  const foundation = { data: { insets: { top: 24, bottom: 24, left: 0, right: 0 }, tripId: 'trip', bookings: [{ id: 'active' }], isTripOngoing: true },
    passengers: {}, mapState: { waypoints: [] } };
  const props = { model: { session: { foundation }, presentation: {}, tripActions: {}, passengerPresentation: {}, bookingActions: {} }, assistance: {} };
  const ordinary = DriverNavigationTopPanel(props);
  const index = ordinary.props.children.findIndex(node => all(node).some(n => n.type === 'Recovery'));
  foundation.passengers.activePendingBooking = { id: 'new' };
  const pending = DriverNavigationTopPanel(props);
  assert.ok(index >= 0);
  assert.ok(all(pending.props.children[index]).find(n => n.type === 'Recovery'));
  assert.equal(pending.props.children[index].type, ordinary.props.children[index].type);
  assert.equal(all(pending).filter(n => n.type === 'Recovery').length, 1);
  foundation.passengers.activePendingBooking = undefined;
  foundation.data.bookings = [];
  assert.equal(all(DriverNavigationTopPanel(props)).find(n => n.type === 'Recovery'), undefined);
});
