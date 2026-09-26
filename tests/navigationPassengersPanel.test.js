const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { buildPassengerPanelItems, passengerPanelLabels } = loader()('features/driver-navigation/passengerPanelModel.ts');
const { getNavigationPassengerStats } = loader()('features/driver-navigation/passengerStats.ts');
const native = { FlatList: 'List', View: 'View', Text: 'Text', TouchableOpacity: 'Button',
  StyleSheet: { create: x => x, absoluteFillObject: {}, hairlineWidth: 1 } };
const mocks = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/features/navigation/RideModal': { RideModal: 'Modal' } };
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all)
  : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : Array.isArray(node) ? node.map(words).join(' ') : words(node?.props?.children ?? '');
function stops(id, seats = 1, pickedUp = false, droppedOff = false) {
  const booking = { id, passengerId: 'same-holder', numberOfSeats: seats };
  return ['pickup', 'dropoff'].map(type => ({ id: `${id}:${type}`, type, booking,
    passenger: { id: 'same-holder', name: 'Même nom' }, address: type === 'pickup' ? `Départ ${id}` : `Destination ${id}`,
    completed: type === 'pickup' ? pickedUp : droppedOff }));
}

test('one row per booking chooses pickup then dropoff; grouped seats and identical holders stay distinct', () => {
  const points = [...stops('a', 3, true), ...stops('b', 1)];
  const rows = buildPassengerPanelItems(points, 1);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].waypoint, points[1]);
  assert.equal(rows[0].isNext, true);
  assert.deepEqual(passengerPanelLabels(rows[0]), { status: 'À bord', seats: '3 places', location: 'Point de dépose' });
  assert.equal(rows[1].waypoint, points[2]);
  assert.equal(rows[1].status, 'waiting');
  assert.equal(rows[1].id, 'b');
  const stats = getNavigationPassengerStats(points);
  assert.equal(stats.inVehicle, 3);
  assert.equal(stats.pendingPickups, 1);
  assert.equal(stats.totalPassengers, 4);
});

test('next booking appears first and completed bookings last without modifying navigation order', () => {
  const points = Object.freeze([...stops('done', 2, true, true), ...stops('waiting'), ...stops('next', 1, true)]);
  const ids = points.map(p => p.id);
  const rows = buildPassengerPanelItems(points, 5);
  assert.deepEqual(rows.map(r => r.id), ['next', 'waiting', 'done']);
  assert.equal(rows[2].status, 'droppedOff');
  assert.equal(rows[2].isNext, false);
  assert.deepEqual(points.map(p => p.id), ids);
  assert.equal(buildPassengerPanelItems(points, 999).some(row => row.isNext), false);
  assert.deepEqual(buildPassengerPanelItems([], 0), []);
});

test('completed dropoff takes priority over an old pickup snapshot; missing seat counts stay readable', () => {
  const rows = buildPassengerPanelItems([...stops('a', 3, false, true), ...stops('b', 0)], 0);
  assert.equal(rows.find(r => r.id === 'a').status, 'droppedOff');
  assert.equal(rows.find(r => r.id === 'b').seats, 1);
  assert.equal(rows.some(r => r.isNext), false);
});

test('rows explain statuses and reporting without nested touch targets, Auto pills or struck-out names', () => {
  const load = loader(mocks);
  const { NavigationPassengerRow } = load('features/driver-navigation/NavigationPassengerRow.tsx');
  const { passengerPanelStyles: styles } = load('features/driver-navigation/NavigationPassengersModal.styles.ts');
  const [item] = buildPassengerPanelItems(stops('a', 3, true), 1);
  const calls = [];
  const row = NavigationPassengerRow.type({ item, onSelect: w => calls.push(['detail', w.id]), onReport: w => calls.push(['report', w.id]) });
  assert.match(words(row), /PROCHAIN ARRÊT.*Même nom.*À bord.*3 places.*Point de dépose.*Destination a/);
  assert.doesNotMatch(words(row), /Auto|SUIVANT|place\(s\)/);
  const buttons = all(row).filter(node => node.type === 'Button');
  assert.equal(buttons.length, 2);
  for (const button of buttons) {
    assert.equal(button.props.accessibilityRole, 'button');
    assert.ok(button.props.accessibilityLabel.includes('Même nom'));
    assert.equal(all(button.props.children).some(n => n.type === 'Button'), false);
  }
  buttons[0].props.onPress(); buttons[1].props.onPress();
  assert.deepEqual(calls, [['detail', 'a:dropoff'], ['report', 'a:dropoff']]);
  const [done] = buildPassengerPanelItems(stops('a', 3, true, true), 2);
  const completed = NavigationPassengerRow.type({ item: done });
  assert.match(words(completed), /Déposé/);
  assert.equal(all(completed).some(n => n.type === 'Button'), false);
  assert.equal(styles.name.textDecorationLine, undefined);
  assert.equal(styles.row.opacity, undefined);
  assert.ok(styles.reportButton.minHeight >= 44);
  assert.ok(styles.detailButton.minHeight >= 44);
  assert.equal(styles.actions.flexWrap, 'wrap');
});

test('panel explains seat counts, uses content height and preserves priority gates and close paths', () => {
  const hooks = hookHarness();
  const load = loader({ ...mocks, react: { ...React, ...hooks.react } });
  const { NavigationPassengersModal } = load('features/driver-navigation/NavigationPassengersModal.tsx');
  const { passengerPanelStyles: styles } = load('features/driver-navigation/NavigationPassengersModal.styles.ts');
  const points = [...stops('a', 3, true), ...stops('b')];
  const calls = [];
  const props = { passengersPanelVisible: true, insets: { bottom: 30 }, waypoints: points,
    passengerStats: getNavigationPassengerStats(points), currentWaypointIndex: 1,
    setPassengersPanelVisible: value => calls.push(value), waypointModalVisibleRef: { current: false },
    setActiveWaypoint() {}, setWaypointModalVisible() {}, openReportForWaypoint() {} };
  const render = patch => hooks.render(() => NavigationPassengersModal({ ...props, ...patch }));
  const tree = render();
  const list = all(tree).find(n => n.type === 'List');
  assert.match(words(list.props.ListHeaderComponent), /2\s+réservations.*4\s+places/);
  assert.match(words(list.props.ListHeaderComponent), /À récupérer.*À bord.*Déposés/);
  assert.equal(list.props.initialNumToRender, 8);
  assert.equal(list.props.removeClippedSubviews, false);
  assert.equal(styles.sheet.height, undefined, 'no forced 85% empty sheet');
  assert.equal(styles.sheet.maxHeight, '85%');
  assert.equal(styles.list.flexShrink, 1);
  tree.props.onRequestClose();
  all(tree).find(n => n.type === 'Button' && words(n).includes('Revenir à la carte')).props.onPress();
  assert.deepEqual(calls, [false, false]);
  assert.equal(all(render()).find(n => n.type === 'List').props.data, list.props.data, 'no regrouping for unrelated renders');
  for (const key of ['backgroundDisclosureVisible', 'securityModalVisible', 'tripEndNotice', 'pickupNotice', 'pickupBypassConfirmation', 'waypointModalVisible']) {
    const hidden = render({ [key]: true });
    assert.equal(hidden.props.visible, false);
    assert.deepEqual(all(hidden).find(n => n.type === 'List').props.data, []);
  }
  hooks.unmount();
});

test('opening a point detail does not claim the driver has already arrived', () => {
  const { NavigationWaypointModal } = loader({ ...mocks,
    '../screen-styles/app/trip/navigate/detail/index': { styles: {} },
  })('features/driver-navigation/NavigationWaypointModal.tsx');
  for (const waypoint of stops('a')) {
    const tree = NavigationWaypointModal({ waypointModalVisible: true, activeWaypoint: waypoint, insets: { bottom: 0 } });
    assert.doesNotMatch(words(tree), /Vous êtes arrivé|Nous sommes arrivés/);
    assert.match(words(tree), /suivi[e]? automatiquement/);
  }
});
