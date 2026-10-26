const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
function nodes(tree) {
  return Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
function fixture() {
  const hooks = hookHarness(), calls = [];
  const state = { auth: { isAuthenticated: true, tokenPayload: { sub: 'driver' } } };
  const context = { active: true, path: '/', pending: false, keyboard: false, busy: false, alerts: [] };
  const queries = {
    profile: { data: { id: 'driver', role: 'driver' } },
    activity: { data: { userId: 'driver', hasLiveActivity: false }, fulfilledTimeStamp: 1000 },
    trips: { data: [] }, bookings: { data: [] }, dispatch: { data: {} },
  };
  const location = { loaded: true, loadError: false, permission: false, enabled: true, consent: false, busy: false,
    setConsent: v => { location.consent = v; calls.push(['consent', v]); },
    authorize: async () => calls.push(['location']), openSettings: async () => calls.push(['settings']),
    retry: () => calls.push(['retry']), defer: () => { location.consent = false; calls.push(['defer']); } };
  const fullScreen = { permission: { allowed: false, optIn: false, notificationsAllowed: true }, busy: false, error: false,
    setOptIn: async v => calls.push(['fullScreen', v]) };
  const prompt = { selected: 'location', close: () => calls.push(['close']), onShown: kind => calls.push(['shown', kind]) };
  let policyOptions, locationOptions;
  const api = (endpoint, type) => ({ endpoints: { [endpoint]: { useQueryState: () => queries[type] } } });
  const module = loader({ react: { ...hooks.react, useContext: () => ({ subscribe: () => () => {}, isBusy: () => context.busy }),
      useSyncExternalStore: (_, get) => get() },
    'react-native': { Platform: { OS: 'android' }, Keyboard: { isVisible: () => context.keyboard } },
    'expo-router': { usePathname: () => context.path },
    '@/store/hooks': { useAppSelector: selector => selector(state) },
    '@/store/selectors': { selectIsAuthenticated: value => value.auth.isAuthenticated },
    '@/store/api/userApi': { userApi: api('getCurrentUser', 'profile') },
    '@/store/api/accountActivityApi': { accountActivityApi: api('getAccountActivity', 'activity') },
    '@/store/api/tripApi': { tripApi: api('getMyActivityTrips', 'trips') },
    '@/store/api/bookingApi': { bookingApi: api('getMyActivityBookings', 'bookings') },
    '@/store/api/driverDispatchApi': { driverDispatchApi: api('driverDispatchStatus', 'dispatch') },
    '@/hooks/useAppIsActive': { useAppIsActive: () => context.active },
    '@/features/navigation/appEntryContext': { useAppEntryPending: () => context.pending },
    '@/features/navigation/rideOverlayContext': { RideOverlayContext: {} },
    '@/services/appActivity': { getAppActiveSince: () => 1000 },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/services/rideAlertSession': { getRideAlertsRevision: () => context.alerts.length,
      pendingRideAlerts: () => context.alerts, subscribeRideAlerts: () => () => {} },
    '@/hooks/profile/useNearbyLocationPermission': { useNearbyLocationPermission: options => { locationOptions = options; return location; } },
    '@/hooks/notifications/useDriverFullScreenPermission': { useDriverFullScreenPermission: () => fullScreen },
    '@/hooks/notifications/useDriverPermissionPrompt': { useDriverPermissionPrompt: options => { policyOptions = options; return prompt; } },
    '@/components/location/BackgroundLocationApproval': { BackgroundLocationApproval: 'LocationApproval' },
    '@/components/permissions/DriverFullScreenApproval': { DriverFullScreenApproval: 'FullScreenApproval' },
  })('components/DriverPermissionsCoordinator.tsx');
  return { hooks, context, queries, calls, state, prompt, location, fullScreen,
    root: () => hooks.render(module.DriverPermissionsCoordinator),
    render: () => nodes(hooks.render(() => module.DriverPermissionSession({ userId: 'driver' }))),
    policy: () => policyOptions, locationOptions: () => locationOptions };
}

test('only the authenticated account with a server-confirmed driver role mounts onboarding', () => {
  const f = fixture(); assert.ok(f.root());
  for (const profile of [undefined, { id: 'driver' }, { id: 'driver', role: 'passenger' }, { id: 'other', role: 'driver' }]) {
    f.queries.profile.data = profile; assert.equal(f.root(), null);
  }
  f.queries.profile.data = { id: 'driver', role: 'driver' }; f.state.auth.isAuthenticated = false;
  assert.equal(f.root(), null); f.hooks.unmount();
});

test('priority work, stale data, forms and background always hide permission prompts', () => {
  const blockers = [
    f => { f.context.active = false; }, f => { f.context.pending = true; }, f => { f.context.keyboard = true; },
    f => { f.context.path = '/publish'; }, f => { f.context.path = '/booking/payment'; },
    f => { f.queries.activity.fulfilledTimeStamp = 999; }, f => { f.queries.activity.isError = true; },
    f => { f.queries.activity.isFetching = true; }, f => { f.queries.activity.data.hasLiveActivity = true; },
    f => { f.queries.activity.data.userId = 'other'; }, f => { f.context.alerts = [{}]; },
    f => { f.queries.dispatch.data.pendingOfferId = 'offer'; },
    f => { f.queries.trips.data = [{ driverId: 'driver', status: 'ongoing' }]; },
    f => { f.queries.bookings.data = [{ passengerId: 'driver', status: 'accepted', trip: { status: 'ongoing' } }]; },
  ];
  for (const block of blockers) {
    const f = fixture(); block(f);
    for (const selected of ['location', 'fullScreen']) {
      f.prompt.selected = selected;
      assert.ok(f.render().filter(n => typeof n.type === 'string' && /Approval$/.test(n.type)).every(n => !n.props.visible));
      assert.equal(f.policy().safe, false);
    }
    f.hooks.unmount();
  }
});

test('location consent reuses permission flow; GPS is left to existing presence coordinator', () => {
  const f = fixture();
  let tree = f.render(), modal = tree.find(n => n.type === 'LocationApproval');
  assert.equal(modal.props.visible, true);
  assert.equal(modal.props.priority, 10);
  assert.equal(f.locationOptions().deferTrackingToCoordinator, true);
  modal.props.onConfirm(); assert.ok(f.calls.some(c => c[0] === 'location'));
  f.location.settingsRequired = true; modal = f.render().find(n => n.type === 'LocationApproval');
  modal.props.onConfirm(); assert.ok(f.calls.some(c => c[0] === 'settings'));
  f.location.permission = true; f.location.consent = false; f.render();
  assert.ok(f.calls.some(c => c[0] === 'close'));
  assert.equal(f.policy().locationNeeded, false); f.hooks.unmount();
});

test('full-screen action goes directly to native permission; a stale button cannot interrupt a trip', () => {
  const f = fixture(); f.prompt.selected = 'fullScreen';
  let modal = f.render().find(n => n.type === 'FullScreenApproval');
  assert.equal(modal.props.visible, true); modal.props.onConfirm();
  assert.deepEqual(f.calls, [['fullScreen', true]]);
  f.context.path = '/trip/navigate/trip'; f.render(); modal.props.onConfirm();
  assert.deepEqual(f.calls, [['fullScreen', true]]);
  f.context.path = '/'; f.fullScreen.permission = { allowed: true, optIn: true, notificationsAllowed: true }; f.render();
  assert.equal(f.policy().fullScreenNeeded, false);
  assert.ok(f.calls.some(c => c[0] === 'close')); f.hooks.unmount();
});

test('an overlay prevents starting, but the permission modal does not block itself', () => {
  const f = fixture(); f.context.busy = true;
  const modal = f.render().find(n => n.type === 'LocationApproval');
  assert.equal(f.policy().overlayBusy, true); assert.equal(modal.props.visible, true);
  modal.props.onClose(); assert.ok(f.calls.some(c => c[0] === 'defer')); assert.ok(f.calls.some(c => c[0] === 'close'));
  f.hooks.unmount();
});

test('actual modal presentation acknowledges the matching permission step', () => {
  const f = fixture();
  f.render().find(n => n.type === 'LocationApproval').props.onShow();
  f.prompt.selected = 'fullScreen';
  f.render().find(n => n.type === 'FullScreenApproval').props.onShow();
  assert.deepEqual(f.calls.filter(c => c[0] === 'shown'), [['shown', 'location'], ['shown', 'fullScreen']]);
  f.hooks.unmount();
});

test('full-screen explanation is in-app, scrollable, optional and opens settings only after a tap', () => {
  const actions = [];
  const { DriverFullScreenApproval } = loader({
    'react-native': { ActivityIndicator: 'Spinner', Platform: { OS: 'android', Version: 34 },
      View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@/features/navigation/RideModal': { RideModal: 'RideModal' },
  })('components/permissions/DriverFullScreenApproval.tsx');
  const tree = DriverFullScreenApproval({ visible: true, busy: false, error: false,
    onConfirm: () => actions.push('authorize'), onClose: () => actions.push('later') });
  assert.equal(tree.props.inApp, true); assert.equal(tree.props.priority, 10);
  assert.ok(nodes(tree).some(n => n.type === 'Scroll')); assert.deepEqual(actions, []);
  const buttons = nodes(tree).filter(n => n.type === 'Button'); assert.equal(buttons.length, 2);
  buttons[0].props.onPress(); buttons[1].props.onPress();
  assert.deepEqual(actions, ['authorize', 'later']);
});
