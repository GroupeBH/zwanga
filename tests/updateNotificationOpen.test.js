const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(initial) {
  const h = hookHarness(), routes = [], tags = []; let expoPress, expoReceived, nativePress, cleared = 0;
  const io = { ready: 'root', path: '/auth-entry' };
  const router = { push: route => routes.push(route) }, dispatch = value => tags.push(value);
  const useOpen = loader({ react: h.react,
    'expo-router': { useRouter: () => router, usePathname: () => io.path, useRootNavigationState: () => io.ready ? { key: io.ready } : undefined },
    '@/store/hooks': { useAppDispatch: () => dispatch }, '@/store/api/baseApi': { baseApi: { util: { invalidateTags: value => value } } },
    'expo-notifications': {
      addNotificationReceivedListener: callback => { expoReceived = callback; return { remove() {} }; },
      addNotificationResponseReceivedListener: callback => { expoPress = callback; return { remove() {} }; },
      getLastNotificationResponseAsync: async () => initial ? { notification: { request: { content: { data: initial } } } } : null,
      clearLastNotificationResponseAsync: async () => { cleared++; },
    },
    '@notifee/react-native': { __esModule: true, EventType: { PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3 }, default: { onForegroundEvent: callback => { nativePress = callback; return () => {}; } } },
  })('hooks/useUpdateNotificationOpen.ts').useUpdateNotificationOpen;
  return { io, routes, tags, cleared: () => cleared, render: () => h.render(useOpen), unmount: () => h.unmount(),
    expo: data => expoPress({ notification: { request: { content: { data } } } }),
    received: data => expoReceived({ request: { content: { data } } }),
    delivered: data => nativePress({ type: 3, detail: { notification: { data } } }),
    native: data => nativePress({ type: 1, detail: { notification: { data } } }) };
}
test('a cold update tap opens the public update page without an account and deduplicates transport events', async () => {
  const data = { type: 'app_update', releaseId: '1', navigateTo: 'https://untrusted.example', tripId: 'unrelated' };
  const f = fixture(data); f.render(); await flush();
  f.expo(data); f.native(data); assert.deepEqual(f.routes, ['/app-update']); assert.equal(f.cleared(), 1);
  assert.deepEqual(f.tags, [['AppUpdate']]); f.unmount();
});

test('foreground update receipt refreshes the server decision without navigating or consuming rides', async () => {
  const f = fixture(); f.render(); await flush();
  f.received({ type: 'app_update', version: 'untrusted', navigateTo: 'https://invalid.example' });
  f.delivered({ type: 'app_update' });
  assert.deepEqual(f.tags, [['AppUpdate'], ['AppUpdate']]);
  assert.deepEqual(f.routes, []);
  f.received({ type: 'new_booking' }); f.delivered({ type: 'new_booking' });
  assert.equal(f.tags.length, 2);
  f.unmount(); f.received({ type: 'app_update' }); f.delivered({ type: 'app_update' });
  assert.equal(f.tags.length, 2);
});
test('cold ride notifications remain available to the ride coordinator; navigation waits for the root', async () => {
  const f = fixture({ type: 'new_booking', bookingId: 'booking' }); f.io.ready = null; f.render(); await flush();
  assert.equal(f.routes.length, 0); f.io.ready = 'root'; f.render(); await flush();
  assert.equal(f.cleared(), 0); assert.equal(f.routes.length, 0);
  f.unmount(); f.native({ type: 'app_update', releaseId: '2' }); assert.equal(f.routes.length, 0);
});
