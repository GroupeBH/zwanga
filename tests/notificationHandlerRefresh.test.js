const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('actual foreground and tap listeners refresh financial and KYC data through the shared policy', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(), dispatched = [], routes = [];
  let foreground, pressed;
  const user = { id: 'user', role: 'passenger' };
  const load = loader({ react: hooks.react,
    'expo-router': { usePathname: () => '/home', useRouter: () => ({ push: href => routes.push(href) }) },
    'react-native': { Platform: { OS: 'android' }, InteractionManager: { runAfterInteractions: () => ({ cancel() {} }) },
      Linking: { addEventListener: () => ({ remove() {} }) } },
    'expo-notifications': { setNotificationHandler() {},
      addNotificationReceivedListener: callback => { foreground = callback; return { remove() {} }; },
      addNotificationResponseReceivedListener: callback => { pressed = callback; return { remove() {} }; } },
    '../hooks/notifications/useOverdueRequestNotification': { useOverdueRequestNotification: () => ({ handlePassengerOverdueNotification: async () => false }) },
    '@/hooks/notifications/useDriverNotifications': { useDriverNotifications() {} },
    '@/hooks/notifications/useRideRinging': { useRideRinging() {} },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog() {} }) },
    '@/services/pushNotifications': {}, '@/services/backgroundNotificationTask': {},
    '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: user }) },
    '@/store/api/tripRequestApi': { useGetMyActivityRequestsQuery: () => ({ data: [] }), useReleaseOverdueDriverMutation: () => [() => {}] },
    '@/store/hooks': { useAppDispatch: () => action => dispatched.push(action), useAppSelector: () => true },
    '@/store/selectors': { selectIsAuthenticated() {} },
    '@/store/api/baseApi': { baseApi: { util: { invalidateTags: tags => ({ tags }) } } },
  });
  hooks.render(() => load('components/NotificationHandler.tsx').NotificationHandler());
  for (const [type, tags, href] of [
    ['referral_withdrawal_cancelled', ['Referral'], '/referrals'],
    ['driver_withdrawal_succeeded', ['DriverSettlement'], '/driver-earnings'],
    ['wallet_admin_adjustment', ['Wallet'], '/wallet'],
    ['kyc_approved', ['User', 'KycStatus', 'Vehicle'], '/(tabs)/profile'],
  ]) {
    const notification = { request: { content: { data: { type } } } };
    foreground(notification);
    for (const tag of tags) assert.ok(dispatched.at(-1).tags.includes(tag), `${type}: foreground ${tag}`);
    pressed({ notification });
    await new Promise(resolve => setImmediate(resolve));
    for (const tag of tags) assert.ok(dispatched.at(-1).tags.includes(tag), `${type}: tap ${tag}`);
    t.mock.timers.tick(100);
    assert.equal(routes.at(-1), href);
  }
  hooks.unmount();
});
