const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const load = loader();
const policy = load('features/notifications/driverInvitation.ts');
const driverId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const data = { actionProtocol: 'driver-v1', type: 'driver_dispatch_offer', driverId, offerId: id, expiresAt: new Date(Date.now() + 30000).toISOString() };

test('dispatch and bookings are distinct; unknown payloads cannot become actions', () => {
  assert.equal(policy.parseDriverInvitation(data).kind, 'dispatch');
  assert.equal(policy.parseDriverInvitation({ ...data, type: 'new_booking', bookingId: id, expiresAt: undefined }).kind, 'booking');
  for (const patch of [{ actionProtocol: null }, { driverId: 'bad' }, { offerId: '../../auth' }, { expiresAt: 'bad' }, { type: 'trip_request' }])
    assert.equal(policy.parseDriverInvitation({ ...data, ...patch }), null);
  assert.equal(policy.notificationDecision('driver-accept'), 'accept');
  assert.equal(policy.notificationDecision('driver-decline'), 'decline');
  assert.equal(policy.notificationDecision('default'), null);
});
test('SDK54 raw and dataString headless payloads are decoded without affecting other pushes', () => {
  assert.deepEqual(policy.readDriverPushData({ notification: null, data }), data);
  const nativeData = { ...data, dataString: 'Consultez la proposition' };
  assert.deepEqual(policy.readDriverPushData({ notification: null, data: nativeData }), nativeData);
  assert.deepEqual(policy.readDriverPushData({ notification: { data: nativeData } }), nativeData);
  assert.deepEqual(policy.readDriverPushData({ notification: { request: { content: { data } } } }), data);
  assert.deepEqual(policy.readDriverPushData({ data: { dataString: JSON.stringify(data) } }), data);
  assert.equal(policy.readDriverPushData({ data: { dataString: 'invalid' } }), undefined);
  assert.equal(policy.parseDriverInvitation(policy.readDriverPushData({ title: 'regular' })), null);
});

function service(platform = 'android') {
  const storage = new Map();
  const displays = [];
  const native = { createChannel: async () => {}, displayNotification: async value => displays.push(value) };
  const loaded = loader({
    '@react-native-async-storage/async-storage': { getItem: async key => storage.get(key), setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key) },
    'expo-notifications': { setNotificationCategoryAsync: async () => {} },
    '@notifee/react-native': { __esModule: true, default: native, AndroidImportance: { HIGH: 4 }, AndroidVisibility: { PRIVATE: 0 }, AndroidStyle: { BIGTEXT: 'BIGTEXT' } },
    'react-native': { Platform: { OS: platform } },
  })('services/driverNotifications.ts');
  return { loaded, displays, storage };
}
test('headless Android uses one stable id, actions, expiry and private lockscreen content', async () => {
  const { loaded, displays } = service();
  await loaded.displayDriverInvitation(data);
  await loaded.displayDriverInvitation(data);
  assert.equal(displays[0].id, displays[1].id);
  assert.equal(displays[0].android.visibility, 0);
  assert.equal(displays[0].android.onlyAlertOnce, true);
  assert.equal(displays[0].android.channelId, 'booking-ring-v2');
  assert.equal(displays[0].android.sound, 'driver_ring');
  assert.ok(displays[0].android.actions.every(action => action.pressAction.launchActivity === undefined));
  assert.deepEqual(displays[0].android.actions.map(a => a.pressAction.id), ['driver-decline', 'driver-accept']);
  assert.ok(displays[0].android.timeoutAfter > 0);
  await loaded.displayDriverInvitation({ ...data, expiresAt: new Date(0).toISOString() });
  assert.equal(displays.length, 2);
});
test('iOS never redisplays a remote notification as a second local notification', async () => {
  const { loaded, displays } = service('ios');
  await loaded.displayDriverInvitation(data);
  assert.equal(displays.length, 0);
});
test('a notification action is consumed once, bound to its recipient and never inferred from a link', async () => {
  const { loaded } = service();
  const invitation = policy.parseDriverInvitation(data);
  assert.equal(await loaded.consumeDriverAction(invitation, driverId), null);
  await loaded.rememberDriverAction(invitation, 'default');
  assert.equal(await loaded.consumeDriverAction(invitation, driverId), null);
  await loaded.rememberDriverAction(invitation, 'driver-accept');
  assert.equal(await loaded.consumeDriverAction(invitation, driverId), 'accept');
  assert.equal(await loaded.consumeDriverAction(invitation, driverId), null);
  await loaded.rememberDriverAction(invitation, 'driver-decline');
  assert.equal(await loaded.consumeDriverAction(invitation, 'another-user'), null);
});
