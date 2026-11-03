const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const words = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : Array.isArray(node) ? node.map(words).join(' ') : node?.props ? words(node.props.children) : '';
const all = node => Array.isArray(node) ? node.flatMap(all) : node?.props ? [node, ...all(node.props.children)] : [];
const tick = () => new Promise(resolve => setImmediate(resolve));

test('completion modal confirms closure without claiming automatic arrival or irrelevant boarding', () => {
  const { NavigationTripEndModal } = loader({
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
    '../screen-styles/app/trip/navigate/detail/index': { styles: {} },
    './NavigationTripRevenueSummary': { NavigationTripRevenueSummary: 'Revenue' },
  })('features/driver-navigation/NavigationTripEndModal.tsx');
  let rated = 0, dismissed = 0;
  for (const completedWhileAppInactive of [false, true]) {
    const tree = NavigationTripEndModal({ tripEndNotice: { tripId: 'trip', distanceMeters: 942, completedWhileAppInactive },
      insets: { bottom: 0 }, trip: { arrival: { name: 'Destination' } }, backgroundDisclosureVisible: false,
      securityModalVisible: false, dismissTripEndNotice: () => dismissed++, handleRatePassengersFromTripEnd: () => rated++ });
    assert.match(words(tree), /Le trajet est terminé.*noter vos passagers/);
    assert.match(words(tree), /Fin du trajet confirmée/);
    assert.doesNotMatch(words(tree), /automatiquement|942|Arrivée détectée|embarquement|veille/);
    all(tree).find(node => node.type === 'Button' && words(node).trim() === 'Noter').props.onPress();
    all(tree).find(node => node.type === 'Button' && words(node) === 'Plus tard').props.onPress();
  }
  assert.equal(rated, 2); assert.equal(dismissed, 2);
});

function completion() {
  const hooks = hookHarness(), spoken = [], dialogs = [], stopped = [], notices = [];
  const summary = { ledgerVerified: true, cashReceivedAmount: 1200, cashToCollectAmount: 0 };
  const { useDriverCompletionActions } = loader({
    react: hooks.react,
    'react-native': { Platform: { OS: 'android' } },
    '@/utils/navigationSpeech': { NavigationSpeech: { stop: async () => {}, speak: text => spoken.push(text) } },
    '@/services/driverBackgroundLocationTask': { stopDriverBackgroundLocationTracking: async id => stopped.push(id) },
    '@/store/hooks': { useAppDispatch: () => () => {} },
    '@/store/api/baseApi': { baseApi: { util: { invalidateTags: tags => tags } } },
  })('hooks/driver-navigation/useDriverCompletionActions.ts');
  const args = { isMountedRef: { current: true }, presentedTripDestinationKeysRef: { current: new Set() },
    tripEndNoticeRef: { current: null }, setTripEndNotice: notice => notices.push(notice),
    showDialog: dialog => dialogs.push(dialog), getDriverTripRevenueSummary: () => ({ unwrap: async () => summary }),
    tripArrivalCoordinate: null, currentLocationRef: { current: null }, lastAcceptedDriverCoordinateRef: { current: null },
    tripId: 'trip', completedDuringInactiveCandidateRef: { current: false }, activeNavigationDestination: null,
    routeCoordinatesRef: { current: [] }, tripDepartureCoordinate: null, autoCompletingTripRef: { current: false },
    trip: { id: 'trip', status: 'ongoing' }, completeTrip: () => ({ unwrap: async () => ({ status: 'completed' }) }),
    reconcileTripStatus: async () => null, refetchTrip() {}, refetchBookings() {} };
  return { hook: hooks.render(() => useDriverCompletionActions(args)), args, spoken, dialogs, stopped, notices };
}

test('server-confirmed completion uses neutral speech once and hydrates the real cash receipt', async () => {
  const f = completion();
  assert.equal(f.hook.presentCompletedTripFromServerSync({ status: 'ongoing' }), false);
  assert.equal(f.hook.presentCompletedTripFromServerSync({ status: 'completed' }), true);
  await tick();
  assert.equal(f.spoken.length, 1);
  assert.match(f.spoken[0], /Le trajet est terminé/);
  assert.doesNotMatch(f.spoken[0], /automatiquement|destination finale|veille/);
  assert.equal(f.notices.at(-1).revenueSummary.cashReceivedAmount, 1200);
  f.hook.presentCompletedTripFromServerSync({ status: 'completed' }); await tick();
  assert.equal(f.spoken.length, 1, 'REST/socket repeats remain deduplicated');
  assert.ok(f.stopped.includes('trip'));
});

test('approach notices and automatic completion still work; unmount suppresses late speech', async () => {
  const f = completion();
  f.hook.presentTripDestinationNotice({ type: 'driver_near_destination', tripId: 'trip', distanceMeters: 10 });
  await tick();
  assert.equal(f.dialogs.length, 1); assert.match(f.dialogs[0].message, /automatiquement après 10 minutes/);
  assert.match(f.spoken[0], /Zone d'arrivée/);
  f.hook.tryCompleteTripFromNavigation(10); await tick();
  assert.equal(f.spoken.length, 2); assert.match(f.spoken[1], /Le trajet est terminé/);
  assert.equal(f.args.autoCompletingTripRef.current, false);
  const off = completion(); off.hook.presentCompletedTripFromServerSync({ status: 'completed' });
  off.args.isMountedRef.current = false; await tick(); assert.equal(off.spoken.length, 0);
});
