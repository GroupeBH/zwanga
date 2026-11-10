const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { getTripDeepLinkHref: resolve } = loader()('utils/tripDeepLink.ts');

test('warm trip navigation links keep their explicit screen and exact ID', () => {
  for (const prefix of ['zwanga://', 'zwanga:///', '', '/']) {
    for (const screen of ['navigate', 'manage']) {
      assert.deepEqual(resolve(`${prefix}trip/${screen}/test-trip`), {
        pathname: `/trip/${screen}/[id]`, params: { id: 'test-trip' },
      });
    }
  }
});

test('trip share links preserve per-trip roles and supported tracking/edit options', () => {
  const user = { id: 'driver' };
  assert.equal(resolve('trip/test-trip?driverId=driver', user).pathname, '/trip/manage/[id]');
  const link = resolve('trip/test-trip?driverId=driver&role=passenger&track=true&openEdit=1', user);
  assert.equal(link.pathname, '/trip/[id]');
  assert.deepEqual(link.params, { id: 'test-trip', driverId: 'driver', role: 'passenger', track: 'true', openEdit: '1' });
  assert.equal(resolve('trip/test-trip?driverId=other', user).pathname, '/trip/[id]');
});

test('query params cannot override the trip ID or inject navigation state', () => {
  assert.deepEqual(resolve('trip/navigate/right-id?id=wrong&screen=auth&state=bad&params=bad#ignored'), {
    pathname: '/trip/navigate/[id]', params: { id: 'right-id' },
  });
});

test('legacy notification links retain the reservation focus before canonical detail redirect', () => {
  assert.deepEqual(resolve('zwanga://trip/manage/trip?bookingId=booking&section=passengers&openEdit=1'), {
    pathname: '/trip/manage/[id]', params: { id: 'trip', bookingId: 'booking', section: 'passengers', openEdit: '1' },
  });
});

test('incomplete, nested and foreign links never become detail IDs', () => {
  for (const path of ['trip/', 'trip/navigate', 'trip/manage/', 'trip/navigate/a/b',
    'trip/manage/a/b', 'trip/a/b', 'trip/navigate/a%2Fb', 'trip/../a', 'https://other/trip/a']) {
    assert.equal(resolve(path), null, path);
  }
});

test('the mounted notification handler routes actual Linking events through the exact trip resolver', t => {
  const hooks = hookHarness(), pushed = [];
  let onUrl, removed = false;
  const noop = () => {};
  const subscription = () => ({ remove: noop });
  const { NotificationHandler } = loader({
    react: hooks.react,
    'react-native': { Platform: { OS: 'android' }, InteractionManager: { runAfterInteractions: () => ({ cancel: noop }) },
      Linking: { addEventListener: (type, callback) => {
        assert.equal(type, 'url'); onUrl = callback; return { remove: () => { removed = true; } };
      } } },
    'expo-router': { usePathname: () => '/', useRouter: () => ({ push: value => pushed.push(value) }) },
    'expo-notifications': { setNotificationHandler: noop,
      addNotificationReceivedListener: subscription, addNotificationResponseReceivedListener: subscription },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: noop, hideDialog: noop }) },
    '@/hooks/notifications/useDriverNotifications': { useDriverNotifications: noop },
    '@/hooks/notifications/useRideRinging': { useRideRinging: noop },
    '@/hooks/notifications/useIosRideAlertRecovery': { useIosRideAlertRecovery: noop },
    '../hooks/notifications/useOverdueRequestNotification': { useOverdueRequestNotification: () => ({
      isOverdueRequestForAccount: () => false, presentPassengerOverdueModal: noop, handlePassengerOverdueNotification: noop,
    }) },
    '@/services/pushNotifications': { ensureAndroidChannel: noop },
    '@/services/backgroundNotificationTask': { registerBackgroundNotificationTask: async () => {} },
    '@/features/notifications/rideSound': { isRemoteNearbyRequestAlert: () => false, parseNearbyPhoneAlert: () => null },
    '@/store/hooks': { useAppDispatch: () => noop, useAppSelector: () => true },
    '@/store/selectors': { selectIsAuthenticated: () => true },
    '@/store/api/baseApi': { baseApi: { util: { invalidateTags: value => value } } },
    '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: { id: 'driver', role: 'driver' } }) },
    '@/store/api/tripRequestApi': { useGetMyActivityRequestsQuery: () => ({ data: [], refetch: noop }),
      useReleaseOverdueDriverMutation: () => [noop] },
  })('components/NotificationHandler.tsx');
  t.after(() => hooks.unmount());
  hooks.render(NotificationHandler);
  for (const prefix of ['zwanga://', 'zwanga:///']) {
    onUrl({ url: `${prefix}trip/navigate/test-trip` });
    assert.deepEqual(pushed.at(-1), { pathname: '/trip/navigate/[id]', params: { id: 'test-trip' } });
  }
  onUrl({ url: 'zwanga://trip/manage/test-trip' });
  assert.equal(pushed.at(-1).pathname, '/trip/manage/[id]');
  onUrl({ url: 'zwanga://trip/test-trip?role=passenger&track=true' });
  assert.equal(pushed.at(-1).pathname, '/trip/[id]');
  const count = pushed.length;
  onUrl({ url: 'zwanga://trip/navigate/test-trip/extra' });
  assert.equal(pushed.length, count, 'no invalid detail request is scheduled');
  hooks.unmount(); assert.equal(removed, true);
});
