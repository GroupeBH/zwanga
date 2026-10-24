const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const driverId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';

for (const platform of ['android', 'ios']) test(`${platform}: icon launch restores a retained request after the sound ends without renewing audio`, async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 100000 });
  const hooks = hookHarness();
  const data = { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3',
    driverId, tripRequestId: requestId, ringUntil: new Date(Date.now() - 1000).toISOString() };
  const noop = () => {};
  const load = loader({
    react: hooks.react, 'expo-router': { usePathname: () => '/' },
    './tokenStorage': { getTokens: async () => assert.fail('expired nearby restoration must not read auth storage') },
    '@react-native-async-storage/async-storage': {},
    'react-native': { Platform: { OS: platform }, AppState: { currentState: 'active', addEventListener: () => ({ remove: noop }) } },
    '@notifee/react-native': { getDisplayedNotifications: async () => [{ id: 'driver-nearby-' + requestId,
      notification: { data, android: { channelId: 'zwanga-ride-ring-v4' } } }] },
    'expo-notifications': { getPresentedNotificationsAsync: async () => platform === 'ios' ? [
      { request: { identifier: 'remote-card', content: { data } } }] : [], addNotificationReceivedListener: () => ({ remove: noop }) },
    '@/services/foregroundRideSound': { stopForegroundRideSound: noop, startForegroundRideSound: () => assert.fail('old alert must not ring') },
    '@/services/foregroundRideAnnouncement': { clearRideAnnouncementSession: noop, reconcileRideAnnouncement: noop,
      silenceRestoredRideAnnouncement: noop, stopRideAnnouncement: noop },
    '@/services/rideEntryAnnouncement': { beginRideSpeechEntry: noop, clearRideSpeechEntry: noop, hasPendingRideSpeechEntry: () => false,
      subscribeRideSpeechEntry: () => noop },
    '@/services/passengerRideAlerts': { dismissOpenedRideResponses: async () => {} },
  });
  const session = load('services/rideAlertSession.ts');
  const useRideRinging = load('hooks/notifications/useRideRinging.ts').useRideRinging;
  t.after(() => hooks.unmount());
  hooks.render(() => useRideRinging(driverId)); await tick();
  assert.deepEqual(session.pendingRideAlerts(driverId), []);
  assert.deepEqual(session.pendingRideEntryAlerts(driverId).map(a => a.id), [requestId]);
});
