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
  assert.equal(text(tree).includes('disponible'), false); assert.equal(text(tree).includes('7 trajets'), false);
  assert.ok(text(tree).includes('9+'));
  const buttons = nodes(tree).filter(node => node.type === 'Button');
  buttons[0].props.onPress(); buttons[1].props.onPress();
  assert.deepEqual(calls, ['/profile', '/notifications']);
  assert.ok(text(HomeHeader.type({ ...props, ongoingDriverTrip: {} })).includes('Trajet conducteur en cours'));
  assert.ok(text(HomeHeader.type({ ...props, ongoingBookedTrip: {}, trackedTripInfo: { role: 'driver' } })).includes('Trajet réservé en cours'));
  assert.equal(text(HomeHeader.type({ ...props, trackedTripInfo: { role: 'driver' } })).includes('en cours'), false);
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
    assert.equal(Object.assign({}, ...closed.props.style).height, 68);
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
    draw().toggleTripsSheet();
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
