const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', Image: 'Image', FlatList: 'List',
  StyleSheet: { create: value => value }, Platform: { OS: 'ios', select: value => value.ios } };
const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  './HomeActivityCards': { HomeActivityCards: 'Priorities' },
  './HomeSheetLoadingState': { HomeSheetLoadingState: 'Loading' } });
const { HomeHeader } = load('components/home/HomeHeader.tsx');
const { HomeTripsSheet } = load('components/home/HomeTripsSheet.tsx');
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return React.isValidElement(node) ? text(node.props.children) : '';
}

test('the greeting has no availability counter but retains ongoing-trip feedback and both header actions', () => {
  const calls = [];
  const props = { insets: { top: 20 }, firstName: 'Alex', unreadNotifications: 12, router: { push: path => calls.push(path) },
    // Even old callers providing these fields cannot restore the redundant counter.
    availableTripsLabel: '7 trajets', latestTrips: Array(7).fill({}) };
  const tree = HomeHeader.type(props);
  assert.ok(text(tree).includes('Bonjour, Alex'));
  assert.doesNotMatch(text(tree), /Demandes proches|Demandes près de moi|Ma disponibilité/);
  assert.equal(text(tree).includes('disponible'), false); assert.equal(text(tree).includes('7 trajets'), false);
  assert.ok(text(tree).includes('9+'));
  const buttons = nodes(tree).filter(node => node.type === 'Button');
  buttons[0].props.onPress(); buttons[1].props.onPress();
  assert.deepEqual(calls, ['/profile', '/notifications']);
  assert.ok(text(HomeHeader.type({ ...props, ongoingDriverTrip: {} })).includes('Trajet conducteur en cours'));
  assert.ok(text(HomeHeader.type({ ...props, ongoingBookedTrip: {}, trackedTripInfo: { role: 'driver' } })).includes('Trajet réservé en cours'));
  assert.equal(text(HomeHeader.type({ ...props, trackedTripInfo: { role: 'driver' } })).includes('en cours'), false);
});

test('plain-language Home actions keep search, publishing and ordering destinations unchanged', () => {
  const calls = [];
  const tree = HomeHeader.type({ insets: { top: 20 }, firstName: 'Alex', unreadNotifications: 0,
    router: { push: route => calls.push(route) } });
  const buttons = nodes(tree).filter(node => node.type === 'Button');
  const command = buttons.find(node => node.props.accessibilityLabel === 'Je commande un trajet');
  assert.ok(command);
  assert.equal(text(command), 'Je commande un trajet');
  assert.equal(command.props.accessibilityRole, 'button');
  assert.doesNotMatch(text(tree), /Demander/);
  assert.ok(nodes(tree).some(node => node.props.accessibilityRole === 'header' && text(node) === 'Que voulez-vous faire ?'));
  const actions = buttons.slice(2);
  assert.deepEqual(actions.map(text), ['Je cherche un trajet', 'Je propose un trajet', 'Je commande un trajet']);
  for (const action of actions) {
    assert.equal(action.props.accessibilityRole, 'button');
    assert.equal(action.props.accessibilityLabel, text(action));
    assert.ok(action.props.accessibilityHint);
  }
  command.props.onPress();
  buttons.find(node => text(node) === 'Je propose un trajet').props.onPress();
  buttons.find(node => text(node) === 'Je cherche un trajet').props.onPress();
  assert.deepEqual(calls, [{ pathname: '/request-create' }, '/publish', '/search']);
});

test('Home action labels wrap without ellipsis or font shrinking and keep accessible touch targets', () => {
  const tree = HomeHeader.type({ insets: { top: 20 }, firstName: 'Alex', unreadNotifications: 0, router: { push() {} } });
  const actions = nodes(tree).filter(node => node.type === 'Button').slice(2);
  const flatten = style => Object.assign({}, ...(Array.isArray(style) ? style : [style]));
  for (const action of actions) {
    const style = flatten(action.props.style);
    assert.ok(style.minHeight >= 44);
    assert.equal(style.height, undefined);
    for (const label of nodes(action).filter(node => node.type === 'Text')) {
      assert.equal(label.props.numberOfLines, undefined);
      assert.notEqual(label.props.allowFontScaling, false);
      assert.notEqual(label.props.adjustsFontSizeToFit, true);
      assert.equal(flatten(label.props.style).flex, 1);
    }
  }
  const { styles } = load('features/home/HomeHeader.styles.ts');
  assert.equal(styles.primaryActions.flexWrap, 'wrap');
  assert.equal(styles.actionDock.height, undefined);
  assert.equal(styles.actionDock.maxHeight, undefined);
});

test('driver intent opens available clients, while passengers and unconfirmed roles keep trip search', () => {
  const calls = [];
  const props = { insets: { top: 20 }, firstName: 'Alex', unreadNotifications: 0,
    router: { push: route => calls.push(route) } };
  for (const isDriver of [true, false, undefined]) {
    const buttons = nodes(HomeHeader.type({ ...props, isDriver })).filter(node => node.type === 'Button');
    const action = buttons[2];
    assert.equal(text(action), isDriver ? 'Je cherche un client' : 'Je cherche un trajet');
    assert.equal(action.props.accessibilityLabel, text(action));
    action.props.onPress();
    assert.equal(text(buttons[3]), 'Je propose un trajet');
    assert.equal(text(buttons[4]), 'Je commande un trajet');
  }
  assert.deepEqual(calls, ['/requests', '/search', '/search']);
});

test('one compact toolbar replaces the duplicated driver title, subtitle, badge and second tab row', () => {
  const modes = [], calls = [];
  const props = { isDriver: true, effectiveTripsSheetOpen: true, sheetTitle: 'Trajets',
    sheetSubtitle: '10 trajets à parcourir', availableDriverRequests: Array(12).fill({ id: 'r' }), latestTrips: [],
    setHomeSheetMode: mode => modes.push(mode), openSheetIndex: () => calls.push('all'),
    toggleTripsSheet: () => calls.push('toggle') };
  const tree = HomeTripsSheet.type(props);
  const elements = nodes(tree);
  assert.equal(text(tree), 'TrajetsClientsVoir tout');
  const tabs = elements.filter(node => node.props.accessibilityRole === 'tab');
  tabs.forEach(tab => tab.props.onPress());
  assert.deepEqual(modes, ['trips', 'requests']);
  assert.equal(tabs[0].props.accessibilityState.selected, true);
  const all = elements.find(node => node.props.accessibilityLabel === 'Voir tous les trajets');
  all.props.onPress();
  const toggle = elements.find(node => node.props.accessibilityLabel === 'Masquer les trajets');
  assert.equal(toggle.props.accessibilityState.expanded, true);
  toggle.props.onPress(); assert.deepEqual(calls, ['all', 'toggle']);
  const requests = nodes(HomeTripsSheet.type({ ...props, isRequestsSheetMode: true }));
  assert.ok(requests.some(node => node.props.accessibilityLabel === 'Voir toutes les commandes'));
  assert.ok(requests.some(node => node.props.accessibilityLabel === 'Masquer les commandes'));
  const passenger = nodes(HomeTripsSheet.type({ ...props, isDriver: false, isRequestsSheetMode: true }));
  assert.equal(passenger.some(node => node.props.accessibilityRole === 'tab'), false);
  assert.equal(passenger.some(node => node.type === 'List'), false, 'stale driver records stay hidden');
});

test('the list starts open, preserves voluntary collapse and restores the choice after a ride', () => {
  for (const isDriver of [true, false]) {
    const hooks = hookHarness();
    const { useHomeSheet } = loader({ react: hooks.react, 'react-native': native })('hooks/home/useHomeSheet.ts');
    const props = { isDriver, width: 390, height: 844, insets: { bottom: 34 }, currentUser: {},
      latestTrips: [], availableDriverRequests: [], isScreenActive: true, isHomeSheetLockedRetracted: false };
    const draw = () => hooks.render(() => useHomeSheet(props));
    assert.equal(draw().effectiveTripsSheetOpen, true);
    props.isHomeSheetLockedRetracted = true;
    assert.equal(draw().effectiveTripsSheetOpen, false);
    draw().toggleTripsSheet();
    props.isHomeSheetLockedRetracted = false;
    assert.equal(draw().effectiveTripsSheetOpen, true);
    draw().toggleTripsSheet(); assert.equal(draw().effectiveTripsSheetOpen, false);
    props.isScreenActive = false; draw(); props.isScreenActive = true;
    assert.equal(draw().effectiveTripsSheetOpen, false);
    props.isHomeSheetLockedRetracted = true; draw(); props.isHomeSheetLockedRetracted = false;
    assert.equal(draw().effectiveTripsSheetOpen, false);
    hooks.unmount();
  }
});

test('expanded trips and requests wrap their content without fixed height or lost list virtualization', () => {
  for (const requests of [true, false]) {
    const onLayout = () => {};
    const props = { sheetBottomOffset: 96, sheetHeight: 298, effectiveTripsSheetOpen: true, onSheetLayout: onLayout,
      isDriver: true, isRequestsSheetMode: requests, availableDriverRequests: [{ id: 'r' }], latestTrips: [{ id: 't' }], bookedTripIds: new Set() };
    const tree = HomeTripsSheet.type(props);
    assert.equal(Object.assign({}, ...tree.props.style).height, undefined);
    assert.equal(Object.assign({}, ...tree.props.style).bottom, 96);
    assert.equal(tree.props.onLayout, onLayout);
    const list = nodes(tree).find(node => node.type === 'List');
    assert.equal(list.props.horizontal, true); assert.equal(list.props.initialNumToRender, 3);
    assert.equal(list.props.maxToRenderPerBatch, 3); assert.equal(list.props.windowSize, 5);
    assert.equal(list.props.style.flexGrow, 0); assert.equal(list.props.style.flexShrink, 0);
    const closed = HomeTripsSheet.type({ ...props, effectiveTripsSheetOpen: false, sheetHeight: 68 });
    assert.equal(Object.assign({}, ...closed.props.style).height, undefined);
    assert.equal(Object.assign({}, ...closed.props.style).minHeight, 68);
    assert.equal(nodes(closed).some(node => node.type === 'List'), false);
  }
});

test('sheet measurements only reposition the map control, reject invalid sizes, and remain stable on repeated layouts', () => {
  for (const platform of ['ios', 'android']) {
    const hooks = hookHarness();
    let changedMeasurements = 0;
    const react = { ...hooks.react, useState: initial => {
      const [value, set] = hooks.react.useState(initial);
      return [value, next => set(previous => {
        const updated = typeof next === 'function' ? next(previous) : next;
        if (updated?.height && updated !== previous) changedMeasurements++;
        return updated;
      })];
    } };
    const { useHomeSheet } = loader({ react, 'react-native': { ...native, Platform: { OS: platform } } })('hooks/home/useHomeSheet.ts');
    const { Spacing } = load('constants/styles.ts');
    const props = { isDriver: true, width: 390, height: 844, currentUser: {}, insets: { bottom: 34 },
      latestTrips: [], availableDriverRequests: [], visibleDriverPassengerMarkers: [], router: { push() {} } };
    const draw = () => hooks.render(() => useHomeSheet(props));
    const open = draw();
    const event = height => ({ nativeEvent: { layout: { height } } });
    open.onSheetLayout(event(255.2));
    let state = draw();
    assert.equal(state.locationButtonBottom, state.sheetBottomOffset + 256 + Spacing.md);
    assert.equal(state.sheetHeight, open.sheetHeight); // Not a feedback loop into sheet layout.
    assert.equal(state.onSheetLayout, open.onSheetLayout);
    for (let i = 0; i < 100; i++) { state.onSheetLayout(event(255.2)); state = draw(); }
    assert.equal(changedMeasurements, 1);
    for (const invalid of [0, -1, NaN, Infinity]) state.onSheetLayout(event(invalid));
    assert.equal(draw().locationButtonBottom, state.locationButtonBottom);
    draw().toggleTripsSheet(); state = draw();
    assert.equal(state.locationButtonBottom, state.sheetBottomOffset + 68 + Spacing.md);
    props.width = 320;
    assert.equal(draw().sheetHeight, 68);
    hooks.unmount();
  }
});

test('Home forwards foreground state to the loader without hiding cached cards or changing sheet height', () => {
  const props = { sheetBottomOffset: 0, sheetHeight: 298, effectiveTripsSheetOpen: true,
    isDriver: true, sheetLoading: true, availableDriverRequests: [], latestTrips: [] };
  for (const active of [true, false]) {
    const tree = HomeTripsSheet.type({ ...props, isScreenActive: active });
    assert.equal(nodes(tree).find(node => node.type === 'Loading').props.active, active);
    assert.equal(Object.assign({}, ...tree.props.style).height, undefined);
  }
});
