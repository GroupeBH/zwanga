const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const installed = { platform: 'android', version: '1.0.19', build: '185' };
const release = { platform: 'android', version: '0.0.0', build: '186', id: '42',
  available: true, comparison: 'native_build', notes: '', publishedAt: '2026-11-25' };
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];

test('Home mounts the update prompt only after activity is known and gives all ride work priority', () => {
  const h = hookHarness();
  const home = { isScreenActive: true, homeDataPrepared: true, passengerAnnouncementReady: true,
    driverAnnouncementReady: true, driverRequestsAnnouncementReady: true, onHomeLayout() {} };
  const context = { isHomeRoleReady: true };
  const parts = ['HomeHeader', 'HomeLocationButton', 'HomeMap', 'HomeTripsSheet', 'HomeActivityCards',
    'HomeOngoingTripSheet', 'HomeRequestPickupSheet', 'HomeAcceptedDriverCourseSheet', 'HomeRequestModal'];
  const { HomeDashboard } = loader({ react: h.react,
    'react-native': { useWindowDimensions: () => ({ fontScale: 1 }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    ...Object.fromEntries(parts.map(name => [`@/components/home/${name}`, { [name]: name }])),
    '@/components/AppUpdatePrompt': { AppUpdatePrompt: 'UpdatePrompt' },
    '@/hooks/home/useHomeController': { useHomeController: () => home },
    '@/features/home/HomeScreen.styles': { styles: {} },
    '@/features/navigation/homePreparationContext': { useReportHomePrepared: () => null },
    '@/hooks/useMainScreenReady': { useMainScreenReady: () => () => {} },
    '@/store/hooks': { useAppSelector: () => 0 },
  })('components/home/HomeDashboard.tsx');
  const prompt = () => nodes(h.render(() => HomeDashboard({ context }))).find(n => n.type === 'UpdatePrompt');
  assert.ok(prompt(), 'Home must actually mount the existing prompt');
  assert.equal(prompt().props.enabled, true);
  for (const key of ['isScreenActive', 'homeDataPrepared', 'passengerAnnouncementReady',
    'driverAnnouncementReady', 'driverRequestsAnnouncementReady']) {
    home[key] = false; assert.equal(prompt().props.enabled, false, key); home[key] = true;
  }
  context.isHomeRoleReady = false; assert.equal(prompt().props.enabled, false); context.isHomeRoleReady = true;
  for (const key of ['activeHomeTrip', 'homeRequestPickup', 'activeTripRequest', 'highlightedDriverRequest',
    'featuredDriverReservation', 'ongoingDriverTrip', 'ongoingPassengerBooking', 'activePassengerBooking']) {
    home[key] = { id: 'ride' }; assert.equal(prompt().props.enabled, false, key); home[key] = null;
  }
  assert.equal(prompt().props.enabled, true, 'resume after ride priority ends, without dismissing the release');
  h.unmount();
});

test('disabled Home prompt suspends lookup, and a revalidation never displays a stale release', () => {
  const h = hookHarness(); let enabled = false, active = true, fetching = false, options;
  const { useAppUpdate } = loader({ react: h.react,
    '@/features/app-updates/nativeVersion': { readInstalledApp: () => installed },
    './useAppIsActive': { useScreenIsActive: () => active },
    '@/store/api/appUpdatesApi': { useGetAppUpdateQuery: (_, input) => {
      options = input; return { currentData: { enabled: true, release }, isFetching: fetching };
    } },
  })('hooks/useAppUpdate.ts');
  const render = () => h.render(() => useAppUpdate(enabled));
  assert.equal(render().release, null); assert.equal(options.skip, true); assert.equal(options.pollingInterval, 0);
  enabled = true; assert.equal(render().release, release); assert.equal(options.skip, false);
  fetching = true; assert.equal(render().release, null);
  fetching = false; assert.equal(render().release, release);
  active = false; assert.equal(render().release, null); h.unmount();
});

test('the prompt forwards its ride-priority gate to the query hook', () => {
  const h = hookHarness(); let received;
  const { AppUpdatePrompt } = loader({ react: h.react,
    'react-native': { StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/features/navigation/RideModal': { RideModal: 'Overlay' },
    '@/hooks/useAppUpdate': { useAppUpdate: enabled => { received = enabled; return { active: false, release: null }; } },
    '@react-native-async-storage/async-storage': {},
  })('components/AppUpdatePrompt.tsx');
  h.render(() => AppUpdatePrompt({ enabled: false })); assert.equal(received, false); h.unmount();
});

function registration(t) {
  const h = hookHarness(), calls = [], timers = new Map(); let timerId = 0;
  const state = { active: true, session: 1, response: { registered: false, enabled: false } };
  t.mock.method(global, 'setTimeout', (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; });
  t.mock.method(global, 'clearTimeout', id => timers.delete(id));
  const register = body => { calls.push(body); return { unwrap: async () => state.response, reset() {} }; };
  const { useAppUpdateClient } = loader({ react: h.react,
    'expo-notifications': { getPermissionsAsync: async () => ({ granted: true }), IosAuthorizationStatus: { PROVISIONAL: 3 } },
    '@/services/tokenStorage': { getStoredFcmToken: async () => 'synthetic-token' },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.session },
    '@/features/app-updates/nativeVersion': { readInstalledApp: () => installed },
    '@/store/api/appUpdatesApi': { useRegisterAppUpdateClientMutation: () => [register] },
  })('hooks/useAppUpdateClient.ts');
  const render = () => h.render(() => useAppUpdateClient('synthetic-user', state.active));
  const fire = async () => { const [id, timer] = [...timers.entries()].at(-1); timers.delete(id); timer.fn(); await tick(); };
  return { h, state, calls, timers, render, fire };
}

test('disabled backend is not cached as successful registration and retries are bounded', async t => {
  const h = registration(t); h.render(); await h.fire();
  assert.equal(h.calls.length, 1); assert.equal([...h.timers.values()].at(-1)?.delay, 30000);
  await h.fire(); assert.equal(h.calls.length, 2); assert.equal(h.timers.size, 0);
  h.state.active = false; h.render(); h.state.active = true; h.state.response = { registered: true }; h.render();
  await h.fire(); assert.equal(h.calls.length, 3, 'activation is discovered on resume without the one-hour false success');
  h.state.active = false; h.render(); h.state.active = true; h.render(); await h.fire();
  assert.equal(h.calls.length, 3, 'real successes remain deduplicated'); h.h.unmount();
});

test('logging back into the same account does not reuse registration from the previous session', async t => {
  const h = registration(t); h.state.response = { registered: true }; h.render(); await h.fire();
  h.state.active = false; h.render(); h.state.session++; h.state.active = true; h.render(); await h.fire();
  assert.equal(h.calls.length, 2); h.h.unmount();
});
