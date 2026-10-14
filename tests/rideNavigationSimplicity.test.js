const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(words).join(' ') : words(node?.props?.children ?? '');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } };

test('passenger pickup context retains vehicle and driver identification inline, without extra requests or a modal', () => {
  const state = { auth: { user: { id: 'passenger' } }, rideRecovery: { userId: 'passenger', entries: [] } };
  const { PassengerPickupNotice } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/store/hooks': { useAppSelector: fn => fn(state) },
    '@/features/navigation/PickupDriverDetails': { PickupDriverDetails: 'DriverIdentity', pickupDriverDetails: trip => ({ name: trip.driverName, photo: trip.driverAvatar }) },
  })('features/passenger-navigation/PassengerPickupNotice.tsx');
  const trip = { id: 'trip', driverName: 'Conducteur test', driverAvatar: 'https://example.invalid/photo',
    vehicle: { brand: 'Toyota', model: 'Yaris', color: 'Rouge', licensePlate: 'TEST' } };
  const booking = { id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'accepted', trip };
  const calls = [];
  const model = { data: { isScreenActive: true, booking, trip }, state: { pickupNotice: {}, pickupNoticeCountdown: 65,
    setPickupNotice: value => calls.push(value) }, presentation: { pickupNoticeTitle: 'Le conducteur est là' } };
  const tree = PassengerPickupNotice({ model });
  assert.equal(all(tree).some(n => n.type === 'Modal'), false);
  assert.match(words(tree), /Le conducteur est là.*Toyota Yaris.*Rouge.*Plaque.*TEST.*1:05/);
  assert.deepEqual(all(tree).find(n => n.type === 'DriverIdentity').props, { name: trip.driverName, photo: trip.driverAvatar });
  const close = all(tree).find(n => n.type === 'Button'); assert.ok(close.props.style.minHeight >= 44);
  close.props.onPress(); assert.deepEqual(calls, [null]);
  for (const flag of ['pickedUp', 'pickedUpConfirmedByPassenger', 'droppedOff', 'droppedOffConfirmedByPassenger']) {
    booking[flag] = true; assert.equal(PassengerPickupNotice({ model }), null); delete booking[flag];
  }
  state.rideRecovery.entries = [{ bookingId: 'booking', tripId: 'trip', stage: 'pickup', decision: 'confirm', state: 'queued' }];
  assert.equal(PassengerPickupNotice({ model }), null, 'a durable local declaration dismisses this reminder, not server boarding');
  state.rideRecovery.userId = 'another'; assert.ok(PassengerPickupNotice({ model }), 'foreign outbox does not hide this passenger context');
  assert.equal(PassengerPickupNotice({ model, hidden: true }), null);
  model.data.isScreenActive = false; assert.equal(PassengerPickupNotice({ model }), null);
});

test('automatic driver GPS arrival updates context without presenting a waypoint modal', () => {
  const hooks = hookHarness(), calls = [];
  const { useDriverNavigationNotices } = loader({ react: { ...React, ...hooks.react },
    'react-native': { ...native, Platform: { OS: 'android' } },
    '@/utils/navigationSpeech': { NavigationSpeech: {} },
    './useDriverPickupNoticeQueue': { useDriverPickupNoticeQueue: () => () => {} },
  })('hooks/driver-navigation/useDriverNavigationNotices.ts');
  const props = { isMountedRef: { current: true }, waypointModalVisibleRef: { current: false },
    pickupBypassConfirmationRef: { current: null }, presentedWaypointIdsRef: { current: new Set() },
    setActiveWaypoint: point => calls.push(point.id), setWaypointModalVisible: () => assert.fail('no automatic modal') };
  const actions = hooks.render(() => useDriverNavigationNotices(props));
  const stop = { id: 'pickup', completed: false };
  actions.presentWaypointModal(stop); actions.presentWaypointModal(stop);
  actions.presentWaypointModal({ id: 'done', completed: true });
  assert.deepEqual(calls, ['pickup']); assert.equal(props.waypointModalVisibleRef.current, false);
  hooks.unmount();
});

test('a saved pickup dismisses reminders only for that booking and never completes the ride locally', () => {
  const hooks = hookHarness(), calls = [];
  const { useDriverPickupActions } = loader({ react: { ...React, ...hooks.react },
    '@/services/rideOutbox': { rideOutbox: {} },
    '@/hooks/navigation/useRideActionFeedback': { useRideActionFeedback: () => ({}) },
  })('hooks/driver-navigation/useDriverPickupActions.ts');
  const booking = { id: 'booking' };
  const props = { pickupNoticeRef: { current: { waypoint: { booking } } },
    pickupBypassConfirmationRef: { current: { waypoint: { booking } } },
    setPickupNotice: v => calls.push(['notice', v]), setPickupNoticeCountdown: v => calls.push(['timer', v]),
    setPickupBypassConfirmation: v => calls.push(['bypass', v]), setPickupBypassAction: v => calls.push(['action', v]) };
  const actions = hooks.render(() => useDriverPickupActions(props));
  actions.acknowledgePickupDeclaration('other'); assert.deepEqual(calls, []);
  actions.acknowledgePickupDeclaration('booking');
  assert.deepEqual(calls, [['notice', null], ['timer', null], ['bypass', null], ['action', null]]);
  assert.equal(booking.pickedUp, undefined);
  hooks.unmount();
});
