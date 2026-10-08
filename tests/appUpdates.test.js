const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value }, Platform: { OS: 'android' } };
const installed = { platform: 'android', version: '1.9.0', build: '12' };
const release = { ...installed, id: '1', version: '1.10.0', available: true, notes: 'Améliorations', publishedAt: '2026-10-07' };
const policy = loader()('features/app-updates/updatePolicy.ts');
test('update notification always routes internally, ignoring payload URLs and unrelated identifiers', () => {
  const { getNotificationHref } = loader()('utils/notificationNavigation.ts');
  assert.equal(getNotificationHref({ type: 'app_update', navigateTo: 'https://invalid.example', tripId: 'x' }), '/app-update');
});
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

test('updates compare numeric version segments, then native builds, never downgrade', () => {
  assert.equal(policy.compareVersions('1.10', '1.9.9'), 1);
  assert.equal(policy.compareVersions('01.02', '1.2.0'), 0);
  assert.equal(policy.compareVersions('beta', '1'), null);
  assert.equal(policy.compareVersions('2147483648', '1'), null);
  assert.equal(policy.isNewerRelease(release, installed), true);
  for (const value of [null, { ...release, available: false }, { ...release, platform: 'ios' }, { ...release, id: '../1' },
    { ...release, version: '1.8', build: '99' }, { ...release, version: '1.9', build: '12' }]) {
    assert.equal(policy.isNewerRelease(value, installed), false);
  }
  assert.equal(policy.isNewerRelease({ ...release, version: '1.9', build: '13' }, installed), true);
});

test('installed version comes from native binary; unknown binary/Expo Go/web fail closed', () => {
  const read = (OS, application) => loader({ 'react-native': { Platform: { OS } },
    'expo-modules-core': { requireOptionalNativeModule: () => application },
  })('features/app-updates/nativeVersion.ts').readInstalledApp();
  assert.deepEqual(read('android', { applicationId: 'com.zwanga', nativeApplicationVersion: '1.9.0', nativeBuildVersion: '12' }), installed);
  assert.equal(read('ios', { applicationId: 'host.exp.Exponent' }), null);
  assert.equal(read('android', null), null);
  assert.equal(read('web', {}), null);
  assert.deepEqual(read('ios', { applicationId: 'com.biso.zwanga', nativeApplicationVersion: '1.5', nativeBuildVersion: '12.1' }),
    { platform: 'ios', version: '1.5', build: '12.1' });
});

test('foreground lookup is cached, skipped when inactive and suppresses stale data on network failure', () => {
  const h = hookHarness(); let active = true, error = false, options;
  const { useAppUpdate } = loader({ react: h.react,
    '@/features/app-updates/nativeVersion': { readInstalledApp: () => installed },
    './useAppIsActive': { useScreenIsActive: () => active },
    '@/store/api/appUpdatesApi': { useGetAppUpdateQuery: (_, value) => { options = value; return { currentData: { enabled: true, release }, isError: error }; } },
  })('hooks/useAppUpdate.ts');
  assert.equal(h.render(useAppUpdate).release, release);
  assert.equal(options.refetchOnMountOrArgChange, 3600);
  active = false; h.render(useAppUpdate); assert.equal(options.skip, true);
  error = true; assert.equal(h.render(useAppUpdate).release, null);
  h.unmount();
});

test('update modal can be postponed for 24h, uses bounded storage and reappears for another release', async () => {
  const h = hookHarness(); let current = release, enabled = true;
  const data = new Map();
  const { AppUpdatePrompt } = loader({ react: h.react, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/features/navigation/RideModal': { RideModal: 'Overlay' },
    '@/hooks/useAppUpdate': { useAppUpdate: () => ({ release: current, active: true }) },
    '@react-native-async-storage/async-storage': { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => data.set(key, value) },
  })('components/AppUpdatePrompt.tsx');
  const render = () => h.render(() => AppUpdatePrompt({ enabled }));
  assert.equal(render(), null); await tick();
  const tree = render();
  assert.equal(tree.type, 'Overlay'); assert.equal(tree.props.inApp, true);
  assert.equal(tree.props.priority, 10);
  const buttons = nodes(tree).filter(n => n.type === 'Button');
  assert.deepEqual(buttons.map(button => button.props.accessibilityLabel), ['Mettre à jour', 'Plus tard']);
  assert.match(JSON.stringify(tree), /La mise à jour se poursuit dans/);
  buttons[1].props.onPress(); assert.equal(render(), null); assert.equal(data.size, 1);
  const saved = JSON.parse([...data.values()][0]); assert.ok(saved.until > Date.now() + 86000000);
  current = { ...release, id: '2' }; render(); await tick();
  assert.ok(render()); enabled = false; assert.equal(render(), null);
  h.unmount();
});

test('update modal opens the allowlisted store directly, coalesces taps, allows retry and postpones on success', async () => {
  const h = hookHarness(); const calls = [], saved = []; let finish, reject;
  const { AppUpdatePrompt } = loader({ react: h.react,
    'react-native': { ...native, Linking: { openURL: url => { calls.push(url); return new Promise((resolve, fail) => { finish = resolve; reject = fail; }); } } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/features/navigation/RideModal': { RideModal: 'Overlay' },
    '@/hooks/useAppUpdate': { useAppUpdate: () => ({ release: { ...release, platform: 'ios', url: 'https://invalid.example' }, active: true }) },
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async (...args) => saved.push(args) },
  })('components/AppUpdatePrompt.tsx');
  const render = () => h.render(() => AppUpdatePrompt({}));
  render(); await tick();
  let button = nodes(render()).find(n => n.props?.accessibilityLabel === 'Mettre à jour');
  button.props.onPress(); button.props.onPress();
  assert.deepEqual(calls, [policy.STORE_URLS.ios]);
  assert.equal(nodes(render()).find(n => n.props?.accessibilityLabel === 'Plus tard').props.disabled, true);
  reject(new Error('offline')); await tick();
  assert.ok(nodes(render()).find(n => n.props?.accessibilityRole === 'alert'));
  assert.equal(saved.length, 0);
  button = nodes(render()).find(n => n.props?.accessibilityLabel === 'Mettre à jour');
  button.props.onPress(); finish(); await tick();
  assert.equal(calls.length, 2); assert.equal(render(), null);
  assert.equal(saved.length, 1); h.unmount();
});

test('update modal ignores stale storage reads after backgrounding and respects persisted postponement', async () => {
  const h = hookHarness(); let active = true, resolveRead;
  const { AppUpdatePrompt } = loader({ react: h.react, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/features/navigation/RideModal': { RideModal: 'Overlay' },
    '@/hooks/useAppUpdate': { useAppUpdate: () => ({ release, active }) },
    '@react-native-async-storage/async-storage': { getItem: () => new Promise(resolve => { resolveRead = resolve; }) },
  })('components/AppUpdatePrompt.tsx');
  const render = () => h.render(() => AppUpdatePrompt({}));
  render(); active = false; render(); resolveRead(null); await tick();
  assert.equal(render(), null);
  active = true; render();
  resolveRead(JSON.stringify({ key: 'zwanga.update-dismissed.android.1', until: Date.now() + 86400000 }));
  await tick(); assert.equal(render(), null); h.unmount();
});

test('store action is allowlisted and double-tap safe, with a local failure message', async () => {
  const h = hookHarness(); let reject, calls = [];
  const { default: Screen } = loader({ react: h.react,
    'react-native': { ...native, Linking: { openURL: url => { calls.push(url); return new Promise((_, fail) => { reject = fail; }); } } },
    'react-native-safe-area-context': { SafeAreaView: 'Safe' },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-router': { useRouter: () => ({}) },
    '@/hooks/useAppUpdate': { useAppUpdate: () => ({ release: { ...release, url: 'https://invalid.example' } }) },
  })('app/app-update.tsx');
  const render = () => h.render(Screen);
  const action = nodes(render()).find(n => n.type === 'Button' && n.props.accessibilityState);
  action.props.onPress(); action.props.onPress();
  assert.deepEqual(calls, [policy.STORE_URLS.android]);
  reject(new Error('offline')); await tick();
  assert.ok(nodes(render()).find(n => n.props?.accessibilityRole === 'alert'));
  h.unmount();
});

test('client registration deduplicates successful sync and cancels pending foreground work', async t => {
  const h = hookHarness(); const calls = []; let session = 1, active = true;
  const timers = new Map(); let timerId = 0;
  t.mock.method(global, 'setTimeout', (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; });
  t.mock.method(global, 'clearTimeout', id => timers.delete(id));
  const register = payload => { calls.push(payload); return { unwrap: async () => ({}), reset() {} }; };
  const { useAppUpdateClient } = loader({ react: h.react,
    'expo-notifications': { getPermissionsAsync: async () => ({ granted: true }), IosAuthorizationStatus: { PROVISIONAL: 3 } },
    '@/services/tokenStorage': { getStoredFcmToken: async () => 'test-token' },
    '@/services/tokenSession': { getTokenSessionVersion: () => session },
    '@/features/app-updates/nativeVersion': { readInstalledApp: () => installed },
    '@/store/api/appUpdatesApi': { useRegisterAppUpdateClientMutation: () => [register] },
  })('hooks/useAppUpdateClient.ts');
  const render = () => h.render(() => useAppUpdateClient('test-user', active));
  render(); assert.equal(calls.length, 0);
  let timer = [...timers.values()].at(-1); assert.equal(timer.delay, 5000); timer.fn(); await tick();
  assert.deepEqual(calls, [{ ...installed, pushToken: 'test-token' }]);
  active = false; render(); active = true; render();
  timer = [...timers.values()].at(-1); timer.fn(); await tick(); assert.equal(calls.length, 1);
  active = false; render(); active = true; render(); session++;
  [...timers.values()].at(-1).fn(); await tick(); assert.equal(calls.length, 1);
  h.unmount(); assert.equal(timers.size, 0);
});

test('client retries delayed push registration once, never requests permissions', async t => {
  const h = hookHarness(); const calls = [], timers = []; let fail = true;
  t.mock.method(global, 'setTimeout', (fn, delay) => { timers.push({ fn, delay }); return timers.length; });
  t.mock.method(global, 'clearTimeout', () => {});
  const register = payload => { calls.push(payload); return { unwrap: async () => { if (fail) throw new Error('token pending'); }, reset() {} }; };
  const { useAppUpdateClient } = loader({ react: h.react,
    'expo-notifications': { getPermissionsAsync: async () => ({ granted: false }), IosAuthorizationStatus: { PROVISIONAL: 3 } },
    '@/services/tokenStorage': { getStoredFcmToken: async () => { throw new Error('must not read denied token'); } },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/features/app-updates/nativeVersion': { readInstalledApp: () => installed },
    '@/store/api/appUpdatesApi': { useRegisterAppUpdateClientMutation: () => [register] },
  })('hooks/useAppUpdateClient.ts');
  h.render(() => useAppUpdateClient('test-user', true));
  timers[0].fn(); await tick(); assert.equal(timers[1].delay, 30000);
  fail = false; timers[1].fn(); await tick();
  assert.deepEqual(calls, [installed, installed]); assert.equal(timers.length, 2); h.unmount();
});

test('police strip opens a number chooser without calling; errors remain inline and double taps coalesce', async () => {
  const h = hookHarness(); let calls = 0, reject;
  const { PoliceContactPanel } = loader({ react: h.react, '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native': { ...native, Linking: { openURL: () => { calls++; return new Promise((_, fail) => { reject = fail; }); } } },
    '@/constants/policeContacts': { POLICE_CONTACTS: [{ id: 'test', label: 'Test', phone: '000' }] },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: () => assert.fail('no modal') }) },
  })('components/PoliceContactPanel.tsx');
  const render = () => h.render(() => PoliceContactPanel({ presentation: 'strip', title: 'SOS — Police' }));
  const trigger = nodes(render()).find(n => n.type === 'Button');
  assert.equal(trigger.props.accessibilityLabel, 'SOS — Police');
  trigger.props.onPress(); assert.equal(calls, 0);
  const number = nodes(render()).filter(n => n.type === 'Button')[1];
  number.props.onPress(); number.props.onPress(); assert.equal(calls, 1);
  reject(new Error('unavailable')); await tick();
  assert.match(JSON.stringify(render()), /composez directement/); h.unmount();
});
