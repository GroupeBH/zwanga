const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));

function environment() {
  const hooks = hookHarness(), values = new Map(), calls = [];
  const env = { hooks, calls, foreground: true, pathname: '/', overlayBusy: false,
    auth: { user: { id: 'passenger' }, isAuthenticated: true }, bookings: [], trips: [], keyboard: false };
  const overlay = { subscribe: () => () => {}, isBusy: () => env.overlayBusy };
  const store = { getState: () => ({ auth: env.auth }) };
  const cache = key => ({ endpoints: { [key === 'bookings' ? 'getMyActivityBookings' : 'getMyActivityTrips']:
    { useQueryState: () => ({ data: env[key], isFetching: false }) } } });
  const native = { async isAvailableAsync() { return true; }, async requestReview() { calls.push('request'); } };
  const { StoreReviewCoordinator } = loader({ react: { ...hooks.react, useContext: () => overlay,
    useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
    'react-native': { AppState: { get currentState() { return env.foreground ? 'active' : 'background'; } },
      Platform: { OS: 'ios' }, Keyboard: { isVisible: () => env.keyboard } },
    'react-redux': { useStore: () => store }, 'expo-router': { usePathname: () => env.pathname },
    '@react-native-async-storage/async-storage': { async getItem(key) { return values.get(key) ?? null; }, async setItem(key, value) { values.set(key, value); } },
    '@/features/navigation/rideOverlayContext': { RideOverlayContext: {} },
    '@/store/hooks': { useAppSelector: selector => selector(store.getState()) },
    '@/store/selectors': { selectIsAuthenticated: state => state.auth.isAuthenticated },
    '@/hooks/useAppIsActive': { useAppIsActive: () => env.foreground },
    '@/features/store-review/nativeReview': { loadNativeReview: async () => native },
    '@/store/api/bookingApi': { bookingApi: cache('bookings') },
    '@/store/api/tripApi': { tripApi: cache('trips') },
    '@/store/api/accountActivityApi': { accountActivityApi: { endpoints: { getAccountActivity: { useQueryState: () => ({
      data: { userId: 'passenger', hasLiveActivity: false }, fulfilledTimeStamp: env.activityAt ?? Date.now(),
    }) } } } },
  })('components/StoreReviewCoordinator.tsx');
  const element = StoreReviewCoordinator();
  return Object.assign(env, { render: () => hooks.render(() => element.type(element.props)),
    complete() { env.bookings = [{ id: 'booking', passengerId: 'passenger', tripId: 'trip', status: 'completed',
      pickedUp: true, droppedOff: true, droppedOffAt: new Date().toISOString(), paymentMode: 'points', paymentStatus: 'succeeded' }]; } });
}

test('a full trip queues a native request only after quiet foreground home; navigation and payment dismissals defer it', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-09-22T10:00:00Z') });
  const env = environment(); env.render(); await flush(); env.render();
  t.mock.timers.tick(5000); await flush(); assert.equal(env.calls.length, 0);
  env.pathname = '/trip/passenger/one'; env.complete(); env.render(); await flush(); env.render();
  t.mock.timers.tick(5000); await flush(); assert.equal(env.calls.length, 0);
  env.pathname = '/'; env.overlayBusy = true; env.render();
  t.mock.timers.tick(5000); await flush(); assert.equal(env.calls.length, 0);
  env.overlayBusy = false; env.render(); t.mock.timers.tick(2999); await flush(); assert.equal(env.calls.length, 0);
  t.mock.timers.tick(1); await flush(); assert.equal(env.calls.length, 1);
  env.render(); env.hooks.unmount();
});

test('a scheduled request is cancelled on blur, background, logout and unmount', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-09-22T10:00:00Z') });
  for (const change of [env => { env.pathname = '/wallet'; }, env => { env.foreground = false; },
    env => { env.auth = { isAuthenticated: false, user: null }; }, env => { env.hooks.unmount(); }]) {
    const env = environment(); env.render(); await flush(); t.mock.timers.tick(1000);
    env.complete(); env.render(); await flush(); env.render(); change(env);
    if (env.pathname !== '/' || !env.foreground) env.render();
    t.mock.timers.tick(5000); await flush(); assert.equal(env.calls.length, 0); env.hooks.unmount();
  }
});

test('overlay busy tracks navigation, hidden native dismissals and queued panels, not only the active entry', () => {
  const { createRideOverlayStore } = loader()('features/navigation/rideOverlayStore.ts');
  const store = createRideOverlayStore(); assert.equal(store.isBusy(), false);
  store.blockNative('payment', true); assert.equal(store.getActive(), null); assert.equal(store.isBusy(), true);
  store.blockNative('payment', false); assert.equal(store.isBusy(), false);
  store.setScope('navigation', true); assert.equal(store.isBusy(), true);
  store.setScope('navigation', false); assert.equal(store.isBusy(), false);
  store.put({ id: 'pending', scope: 'global', priority: 1 }); assert.equal(store.isBusy(), true);
  store.remove('pending'); assert.equal(store.isBusy(), false);
});

test('returning from sleep waits for a fresh server activity snapshot before requesting', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-09-22T10:00:00Z') });
  const env = environment(); env.render(); await flush(); t.mock.timers.tick(1000);
  env.complete(); env.foreground = false; env.render(); await flush();
  env.activityAt = Date.now(); t.mock.timers.tick(60000);
  env.foreground = true; env.render(); await flush(); env.render();
  t.mock.timers.tick(5000); await flush(); assert.equal(env.calls.length, 0);
  env.activityAt = Date.now(); env.render(); t.mock.timers.tick(3000); await flush();
  assert.equal(env.calls.length, 1); env.hooks.unmount();
});
