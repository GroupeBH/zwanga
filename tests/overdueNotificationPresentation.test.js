const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('the mounted handler defers unrelated reminders, selects the matching command and only closes its own modal', t => {
  const hooks = hookHarness(), shown = [], hidden = [], routes = [];
  const user = { id: 'passenger', role: 'passenger' };
  const request = id => ({ id, passengerId: user.id, status: 'driver_selected', selectedDriverId: 'driver',
    driverPickupOverdueNotifiedAt: new Date().toISOString(), departureDateMax: new Date(Date.now() - 60000).toISOString() });
  const rows = [request('old-command'), request('current-command')];
  const env = { path: '/request-details/current-command', dialog: null };
  const noop = () => {};
  const dialog = {
    showDialog: options => { env.dialog = options; shown.push(options); },
    hideDialogFor: key => { hidden.push(key); if (env.dialog?.ownerKey === key) env.dialog = null; },
  };
  const { NotificationHandler } = loader({ react: hooks.react,
    'expo-router': { usePathname: () => env.path, useRouter: () => ({ push: path => routes.push(path) }) },
    'react-native': { Platform: { OS: 'android' }, InteractionManager: { runAfterInteractions: () => ({ cancel: noop }) },
      Linking: { addEventListener: () => ({ remove: noop }) } },
    'expo-notifications': { setNotificationHandler: noop, addNotificationReceivedListener: () => ({ remove: noop }),
      addNotificationResponseReceivedListener: () => ({ remove: noop }) },
    '@/components/ui/DialogProvider': { useDialog: () => dialog },
    '@/hooks/notifications/useDriverNotifications': { useDriverNotifications: noop },
    '@/hooks/notifications/useRideRinging': { useRideRinging: noop },
    '@/hooks/notifications/useIosRideAlertRecovery': { useIosRideAlertRecovery: noop },
    '@/services/pushNotifications': { ensureAndroidChannel: noop },
    '@/services/backgroundNotificationTask': { registerBackgroundNotificationTask: async () => {} },
    '@/store/hooks': { useAppDispatch: () => noop, useAppSelector: () => true },
    '@/store/selectors': { selectIsAuthenticated: () => true },
    '@/store/api/baseApi': { baseApi: { util: { invalidateTags: value => value } } },
    '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: user }) },
    '@/store/api/tripRequestApi': {
      useGetMyActivityRequestsQuery: () => ({ data: rows, refetch: () => ({ unwrap: async () => rows }) }),
      useReleaseOverdueDriverMutation: () => [() => { throw Error('Never release without user action'); }],
    },
  })('components/NotificationHandler.tsx');
  t.after(() => hooks.unmount());
  const render = () => hooks.render(NotificationHandler);
  render();
  assert.equal(env.dialog.ownerKey, 'overdue:passenger:current-command', 'an older row never covers the current command');
  env.path = '/request-details/new-command'; render();
  assert.equal(env.dialog, null); assert.equal(shown.length, 1);
  env.path = '/request-details/current-command'; render();
  assert.equal(shown.length, 2, 'a deferred unresolved reminder is still available');
  dialog.showDialog({ title: 'Paiement confirmé', ownerKey: 'payment' });
  env.path = '/trip/navigate/another'; render();
  assert.equal(env.dialog.ownerKey, 'payment');
  assert.deepEqual(hidden, ['overdue:passenger:current-command', 'overdue:passenger:current-command']);
  assert.deepEqual(routes, []);
});
