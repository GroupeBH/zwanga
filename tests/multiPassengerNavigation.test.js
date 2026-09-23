const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const React = require('react');
const booking = (id, patch = {}) => ({ id, tripId: 'trip', passengerId: `holder-${id}`, passengerName: `Titulaire ${id}`,
  status: 'accepted', numberOfSeats: 1, ...patch });
const nativeMocks = { 'react-native': { Platform: { OS: 'ios' }, StyleSheet: { create: x => x } }, 'expo-location': {} };

test('group seats affect occupancy but never multiply booking identities or confirmation targets', () => {
  const { getNavigationPassengerStats } = loader()('features/driver-navigation/passengerStats.ts');
  const a = booking('a', { numberOfSeats: 3 }), b = booking('b', { numberOfSeats: 2 }), c = booking('c', { passengerId: a.passengerId });
  const stops = [a, b, c].flatMap(item => ['pickup', 'dropoff'].map(type => ({ id: `${item.id}:${type}`, type,
    booking: item, passenger: { id: item.passengerId, name: item.passengerName }, completed: item.id === 'a' && type === 'pickup' })));
  let stats = getNavigationPassengerStats(stops);
  assert.equal(stats.totalPassengers, 6); assert.equal(stats.inVehicle, 3); assert.equal(stats.pendingPickups, 3);
  assert.equal(stats.passengers.length, 3, 'three bookings, including two by the same account');
  stops[1].completed = true; stats = getNavigationPassengerStats(stops);
  assert.equal(stats.inVehicle, 0); assert.equal(stats.completedDropoffs, 3);
});

test('shared driver action guard prevents cross-booking double taps and rejects obsolete requests', () => {
  const hooks = hookHarness(), processing = [];
  const { useDriverBookingActionGuard } = loader({ ...nativeMocks, react: hooks.react })('hooks/driver-navigation/useDriverBookingActionGuard.ts');
  const a = booking('a', { status: 'pending' }), b = booking('b', { numberOfSeats: 3 });
  const props = { tripId: 'trip', active: true, bookings: [a, b], setProcessingBookingId: id => processing.push(id) };
  const render = () => hooks.render(() => useDriverBookingActionGuard(props));
  let begin = render();
  assert.equal(begin({ ...a, tripId: 'elsewhere' }, 'accept'), null);
  const first = begin(a, 'accept'); assert.ok(first);
  assert.equal(begin(b, 'pickup-confirm'), null); assert.equal(begin(a, 'reject'), null);
  first.finish(); const second = begin(b, 'pickup-confirm'); assert.ok(second);
  first.finish(); assert.equal(processing.at(-1), 'b', 'a late finish never clears another booking’s spinner');
  props.active = false; render(); assert.equal(second.isCurrent(), false);
  props.active = true; begin = render(); assert.equal(second.isCurrent(), false);
  assert.equal(begin(b, 'pickup-cancel'), null, 'an in-flight request stays locked through background transitions');
  second.finish();
  props.bookings = [{ ...b, interruptionRequest: { id: 'new', status: 'pending' } }]; begin = render();
  assert.equal(begin({ ...b, interruptionRequest: { id: 'old', status: 'pending' } }, 'interrupt-confirm'), null);
  const current = begin(props.bookings[0], 'interrupt-confirm'); assert.ok(current); current.finish();
  props.bookings = [{ ...b, pickedUp: true }]; begin = render(); assert.equal(begin(b, 'pickup-confirm'), null);
  props.tripId = 'next'; begin = render(); assert.equal(begin(b, 'pickup-cancel'), null);
  hooks.unmount(); assert.equal(begin(b, 'pickup-confirm'), null);
});

function notices() {
  const hooks = hookHarness(), shown = [], spoken = [];
  const { useDriverPickupNoticeQueue } = loader({ ...nativeMocks, react: hooks.react,
    '@/utils/navigationSpeech': { NavigationSpeech: { stop: async () => {}, speak: value => spoken.push(value) } },
  })('hooks/driver-navigation/useDriverPickupNoticeQueue.ts');
  const props = { tripId: 'trip', isScreenActive: true, isMountedRef: { current: true },
    pickupNotice: null, pickupBypassConfirmation: null, pickupNoticeRef: { current: null }, pickupBypassConfirmationRef: { current: null },
    presentedPickupNoticeKeysRef: { current: new Set() }, highestPickupNoticePriorityRef: { current: new Map() },
    visibleBookings: [booking('a'), booking('b'), booking('c')], setPickupNoticeCountdown() {},
    setPickupNotice: value => { props.pickupNotice = value; shown.push(value); } };
  const render = () => hooks.render(() => useDriverPickupNoticeQueue(props));
  const emit = (id, type = 'driver_arrived_pickup') => render()({ bookingId: id, type }, {
    id: `${id}:pickup`, type: 'pickup', booking: booking(id), passenger: { id: `holder-${id}`, name: `Titulaire ${id}` } });
  const close = () => { props.pickupNotice = null; props.pickupNoticeRef.current = null; render(); };
  render(); return { hooks, props, render, emit, close, shown, spoken };
}

test('simultaneous pickup notices remain FIFO by booking and keep only its highest stage', async () => {
  const h = notices();
  h.emit('a'); h.emit('b'); h.emit('b', 'parties_nearby'); h.emit('c'); h.render();
  assert.equal(h.props.pickupNotice.waypoint.booking.id, 'a'); assert.equal(h.shown.length, 1);
  h.close(); assert.equal(h.props.pickupNotice.waypoint.booking.id, 'b'); assert.equal(h.props.pickupNotice.type, 'parties_nearby');
  h.emit('b', 'driver_arrived_pickup'); assert.equal(h.shown.length, 2);
  h.close(); assert.equal(h.props.pickupNotice.waypoint.booking.id, 'c');
  h.close(); assert.equal(h.props.pickupNotice, null);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(h.spoken.length, 0, 'closed notice never speaks over the next passenger');
  h.hooks.unmount();
});

test('queued pickup is retained behind a bypass prompt, but removed if cancelled or from another trip', () => {
  const h = notices();
  h.props.pickupBypassConfirmation = {}; h.props.pickupBypassConfirmationRef.current = {};
  h.emit('a'); h.emit('b'); h.emit('unknown'); assert.equal(h.shown.length, 0);
  h.props.visibleBookings = [booking('a', { status: 'cancelled' }), booking('b')];
  h.props.pickupBypassConfirmation = null; h.props.pickupBypassConfirmationRef.current = null; h.render();
  assert.equal(h.props.pickupNotice.waypoint.booking.id, 'b');
  h.emit('c'); h.props.tripId = 'another'; h.close(); assert.equal(h.props.pickupNotice, null);
  h.hooks.unmount();
});

test('information notices queue instead of replacing other passengers, with bounded memory and cleanup', () => {
  const { createRideOverlayStore } = loader()('features/navigation/rideOverlayStore.ts');
  const store = createRideOverlayStore(); store.setScope('driver:trip', true);
  const a = { title: 'À bord', message: 'Groupe A', expiresAt: Date.now() + 10000 };
  const b = { ...a, message: 'Groupe B' };
  store.showNotice('driver:trip', a); store.showNotice('driver:trip', b); store.showNotice('driver:trip', b);
  assert.equal(store.getNotice('driver:trip'), a);
  store.clearNotice('driver:trip', a); const current = store.getNotice('driver:trip'); assert.equal(current.message, 'Groupe B');
  store.clearNotice('driver:trip', a); assert.equal(store.getNotice('driver:trip'), current);
  store.clearNotice('driver:trip', current); assert.equal(store.getNotice('driver:trip'), null);
  for (let i = 0; i < 100; i++) store.showNotice('driver:trip', { ...a, message: String(i) });
  let count = 0; while (store.getNotice('driver:trip')) { count++; store.clearNotice('driver:trip'); }
  assert.equal(count, 21);
  store.showNotice('driver:trip', a); store.showNotice('driver:trip', b); store.clearNotices('driver:trip');
  assert.equal(store.getNotice('driver:trip'), null);
  store.showNotice('driver:trip', a); store.showNotice('driver:trip', b); store.setScope('driver:trip', false);
  store.setScope('driver:trip', true); store.clearNotice('driver:trip'); assert.equal(store.getNotice('driver:trip'), null);
});

test('driver interruption response belongs to the reservation holder, not another booking by that holder', async () => {
  const hooks = hookHarness(), sent = []; let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const { usePassengerNavigationInterruption } = loader({ react: { ...React, ...hooks.react },
    '@/features/passenger-navigation/PassengerInterruptionFarePreview': { PassengerInterruptionFarePreview: 'Preview' },
  })('hooks/passenger-navigation/usePassengerNavigationInterruption.ts');
  const a = booking('a', { numberOfSeats: 3, pickedUp: true });
  const props = { isScreenActive: true, booking: a, tripId: 'trip', trip: { status: 'ongoing', interruptionRequest: { id: 'i', status: 'pending', confirmations: [
    { bookingId: 'different', passengerId: a.passengerId, status: 'confirmed' },
    { bookingId: 'a', passengerId: a.passengerId, status: 'pending' },
  ] } }, refetchBooking: async () => {}, refetchTrip: async () => {}, showDialog() {},
    confirmDriverTripInterruption: value => { sent.push(value); return { unwrap: () => pending }; },
    rejectDriverTripInterruption: value => { sent.push(value); return { unwrap: () => pending }; } };
  const render = () => hooks.render(() => usePassengerNavigationInterruption(props));
  const actions = render(); assert.equal(actions.hasRespondedToDriverInterruption, false);
  const first = actions.handleConfirmDriverInterruption(); await actions.handleRejectDriverInterruption();
  assert.deepEqual(sent, [{ tripId: 'trip', bookingId: 'a' }], 'one holder response covers the three reserved seats');
  props.isScreenActive = false; render(); finish({}); await first;
  props.isScreenActive = true;
  props.trip = { ...props.trip, interruptionRequest: { ...props.trip.interruptionRequest, confirmations: [props.trip.interruptionRequest.confirmations[0]] } };
  const missing = render();
  assert.equal(missing.canRespondToDriverInterruption, false, 'another booking by the holder is not authorization for this booking');
  await missing.handleConfirmDriverInterruption(); assert.equal(sent.length, 1);
  hooks.unmount();
});

const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(words).join('') : node?.props ? words(node.props.children) : '';

test('virtualized stop selection and reports target the selected booking, including groups with identical names', () => {
  const native = { FlatList: 'List', Text: 'Text', View: 'View', TouchableOpacity: 'Button', StyleSheet: { create: value => value } };
  const { NavigationPassengersModal } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/features/navigation/RideModal': { RideModal: 'Modal' }, '../screen-styles/app/trip/navigate/detail/index': { styles: {} },
  })('features/driver-navigation/NavigationPassengersModal.tsx');
  const stops = Array.from({ length: 100 }, (_, i) => ({ id: `${i}:pickup`, type: 'pickup', completed: false,
    address: `Départ ${i}`, passenger: { id: `holder-${i}`, name: 'Titulaire' }, booking: booking(String(i), { numberOfSeats: 3 }) }));
  const calls = [], ref = { current: false };
  const tree = NavigationPassengersModal({ passengersPanelVisible: true, waypoints: stops, passengerStats: {}, insets: { bottom: 20 },
    currentWaypointIndex: 0, waypointModalVisibleRef: ref, setActiveWaypoint: point => calls.push(['selected', point.booking.id]),
    setPassengersPanelVisible: value => calls.push(['panel', value]), setWaypointModalVisible: value => calls.push(['waypoint', value]),
    openReportForWaypoint: point => calls.push(['report', point.booking.id]) });
  const list = all(tree).find(node => node.type === 'List');
  assert.equal(list.props.initialNumToRender, 8); assert.equal(list.props.removeClippedSubviews, false);
  assert.equal(list.props.data.length, 100); assert.equal(list.props.keyExtractor(stops[2]), '2:pickup');
  const row = list.props.renderItem({ item: stops[2], index: 2 });
  assert.match(words(row), /3 place\(s\).*Départ 2/);
  row.props.onPress(); assert.deepEqual(calls, [['selected', '2'], ['panel', false], ['waypoint', true]]);
  all(row).filter(node => node.type === 'Button')[1].props.onPress({ stopPropagation() {} });
  assert.deepEqual(calls.at(-1), ['report', '2']);
});

test('boarding another booking cannot dismiss the current pickup prompt or its countdown', () => {
  const hooks = hookHarness(), notices = [], countdown = [];
  const { useDriverNavigationNotices } = loader({ ...nativeMocks, react: hooks.react,
    '@/utils/navigationSpeech': { NavigationSpeech: { stop: async () => {}, speak() {} } },
  })('hooks/driver-navigation/useDriverNavigationNotices.ts');
  const a = booking('a'), b = booking('b', { numberOfSeats: 3 });
  const pickup = { type: 'driver_arrived_pickup', waypoint: { booking: a, passenger: { name: a.passengerName } } };
  const props = { tripId: 'trip', isScreenActive: true, isMountedRef: { current: true }, visibleBookings: [a, b],
    pickupNotice: pickup, pickupNoticeRef: { current: pickup }, pickupBypassConfirmation: null, pickupBypassConfirmationRef: { current: null },
    presentedPickupNoticeKeysRef: { current: new Set() }, highestPickupNoticePriorityRef: { current: new Map() },
    presentedPassengerBoardedKeysRef: { current: new Set() },
    setPickupNotice: value => { props.pickupNotice = value; }, setPickupNoticeCountdown: value => countdown.push(value),
    showDialog: value => notices.push(value) };
  const actions = hooks.render(() => useDriverNavigationNotices(props));
  actions.presentPassengerBoardedNotice({ bookingId: 'b', type: 'pickup_confirmed' });
  assert.equal(props.pickupNotice, pickup); assert.deepEqual(countdown, []); assert.equal(notices.length, 1);
  actions.presentPassengerBoardedNotice({ bookingId: 'b', type: 'pickup_confirmed' }); assert.equal(notices.length, 1);
  actions.presentPassengerBoardedNotice({ bookingId: 'a', type: 'pickup_confirmed' });
  assert.equal(props.pickupNoticeRef.current, null); assert.deepEqual(countdown, [null]);
  props.isMountedRef.current = false; hooks.unmount();
});
