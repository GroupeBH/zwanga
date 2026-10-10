const test = require('node:test');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const { loader } = require('./helpers/loadTypeScript.cjs');
const load = loader();
const policy = load('features/notifications/driverInvitation.ts');
const { driverRingDeadline } = load('features/notifications/driverRinging.ts');
const driverId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const data = { actionProtocol: 'driver-v1', type: 'driver_dispatch_offer', driverId, offerId: id, expiresAt: new Date(Date.now() + 30000).toISOString() };

test('ring deadline is bounded, keeps business expiry and fails silent for invalid timing', () => {
  const invitation = { kind: 'booking', id, driverId };
  const now = Date.now();
  assert.equal(driverRingDeadline(invitation, now), now + 30000);
  assert.equal(driverRingDeadline({ ...invitation, ringUntil: new Date(now + 5000).toISOString() }, now), now + 5000);
  assert.equal(driverRingDeadline({ ...invitation, expiresAt: new Date(now + 1000).toISOString(),
    ringUntil: new Date(now + 60000).toISOString() }, now), now + 1000);
  assert.equal(driverRingDeadline({ ...invitation, ringUntil: 'invalid' }, now), now);
});

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

function service(platform = 'android', account = driverId) {
  const storage = new Map();
  const displays = [];
  const channels = [];
  const cancelled = [], presented = [];
  const appState = { currentState: 'background' };
  const native = { createChannel: async value => channels.push(value), displayNotification: async value => displays.push(value),
    cancelNotification: async id => cancelled.push(id), getDisplayedNotifications: async () => displays.map(notification => ({ id: notification.id, notification })) };
  const loaded = loader({
    './tokenStorage': { getTokens: async () => ({ refreshToken: account ? `x.${Buffer.from(JSON.stringify({ sub: account, exp: Date.now()/1000+3600 })).toString('base64url')}.x` : null }) },
    '@react-native-async-storage/async-storage': { getItem: async key => storage.get(key), setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key) },
    'expo-notifications': { setNotificationCategoryAsync: async () => {},
      getPresentedNotificationsAsync: async () => presented, dismissNotificationAsync: async id => cancelled.push(id) },
    '@notifee/react-native': { __esModule: true, default: native, AndroidImportance: { HIGH: 4 }, AndroidVisibility: { PRIVATE: 0 }, AndroidStyle: { BIGTEXT: 'BIGTEXT' } },
    'react-native': { Platform: { OS: platform }, AppState: appState },
  })('services/driverNotifications.ts');
  return { loaded, displays, storage, channels, cancelled, appState, native, presented };
}

test('long-ring channel is configured independently of recipient role before capability registration', async () => {
  const { loaded, channels } = service('android', null);
  await loaded.configureDriverNotifications();
  assert.equal(channels.length, 1);
  assert.equal(channels[0].id, 'booking-ring-v2');
  assert.equal(channels[0].sound, 'driver_ring');
  assert.equal(channels[0].importance, 4);
  assert.equal(channels[0].vibration, true);
});
test('headless Android uses one stable id, actions, expiry and private lockscreen content', async () => {
  const { loaded, displays } = service();
  await Promise.all([loaded.displayDriverInvitation(data), loaded.displayDriverInvitation(data)]);
  assert.equal(displays.length, 1, 'duplicate delivery must not restart the native timeout');
  assert.equal(displays[0].id, `driver-dispatch-${id}`);
  assert.equal(displays[0].android.visibility, 0);
  assert.equal(displays[0].android.onlyAlertOnce, true);
  assert.equal(displays[0].android.channelId, 'booking-ring-v2');
  assert.equal(displays[0].android.sound, 'driver_ring');
  assert.equal(displays[0].android.loopSound, true);
  assert.equal(displays[0].android.autoCancel, true);
  assert.equal(displays[0].android.ongoing, true);
  assert.equal(displays[0].android.lightUpScreen, true);
  assert.ok(displays[0].android.actions.every(action => action.pressAction.launchActivity === undefined));
  assert.deepEqual(displays[0].android.actions.map(a => a.pressAction.id), ['driver-decline', 'driver-accept']);
  assert.ok(displays[0].android.timeoutAfter > 0);
  assert.ok(displays[0].android.timeoutAfter <= 30000);
  await loaded.displayDriverInvitation({ ...data, expiresAt: new Date(0).toISOString() });
  assert.equal(displays.length, 1);
});

test('booking sound stops after 30s without expiring the booking; late rings are ignored', async () => {
  const f = service();
  const booking = { ...data, type: 'new_booking', bookingId: id, expiresAt: undefined };
  await f.loaded.displayDriverInvitation({ ...booking, ringUntil: new Date(0).toISOString() });
  assert.equal(f.displays.length, 0);
  await f.loaded.displayDriverInvitation(booking);
  assert.ok(f.displays[0].android.timeoutAfter > 0 && f.displays[0].android.timeoutAfter <= 30000);
});

test('foreground receipt stays silent even if a duplicate arrives after leaving the app', async () => {
  const f = service();
  f.appState.currentState = 'active';
  await f.loaded.displayDriverInvitation(data);
  assert.equal(f.displays.length, 0);
  f.appState.currentState = 'background';
  await f.loaded.displayDriverInvitation(data);
  assert.equal(f.displays.length, 0);
});

test('reopening by the launcher cancels only this account invitations without replaying duplicates', async () => {
  const f = service();
  await f.loaded.displayDriverInvitation(data);
  f.displays.push({ id: 'chat', data: { type: 'message' } });
  f.displays.push({ id: 'foreign', data: { ...data, driverId: '00000000-0000-4000-8000-000000000099' } });
  f.appState.currentState = 'active';
  await f.loaded.silenceDriverInvitations(driverId);
  assert.deepEqual(f.cancelled, [`driver-dispatch-${id}`]);
  f.appState.currentState = 'background';
  await f.loaded.displayDriverInvitation(data);
  assert.equal(f.displays.length, 3, 'dismissed notification must not ring on redelivery');
});

test('iOS opening dismisses only the matching remote alert, never messages or another booking', async () => {
  const f = service('ios');
  f.presented.push({ request: { identifier: 'apns-incoming', content: { data } } },
    { request: { identifier: 'apns-chat', content: { data: { type: 'message' } } } });
  f.appState.currentState = 'active';
  await f.loaded.silenceDriverInvitations(driverId);
  assert.deepEqual(f.cancelled, [`driver-dispatch-${id}`, 'apns-incoming']);
});

test('opening the app while native display is pending immediately cancels it afterwards', async () => {
  const f = service();
  f.native.displayNotification = async value => { f.displays.push(value); f.appState.currentState = 'active'; };
  await f.loaded.displayDriverInvitation(data);
  assert.deepEqual(f.cancelled, [`driver-dispatch-${id}`]);
});

test('opening silences scheduled nearby alerts on either platform without touching other recipients or accepting', async () => {
  const nearby = { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', driverId, tripRequestId: id };
  for (const platform of ['android', 'ios']) {
    const f = service(platform);
    const cards = [{ id: 'nearby', data: nearby }, { id: 'chat', data: { type: 'message' } },
      { id: 'foreign', data: { ...nearby, driverId: '00000000-0000-4000-8000-000000000099' } }];
    if (platform === 'android') f.displays.push(...cards);
    else f.presented.push(...cards.map(card => ({ request: { identifier: card.id, content: { data: card.data } } })));
    await f.loaded.silenceDriverInvitations(driverId);
    assert.deepEqual(f.cancelled, [], 'background receipt is not automatically silenced');
    f.appState.currentState = 'active';
    await f.loaded.silenceDriverInvitations(driverId);
    assert.deepEqual(f.cancelled, ['nearby']);
    assert.equal(f.storage.size, 0, 'no accept/decline intent is created');
  }
});

test('a failed native display may retry and a shorter server deadline is never extended', async () => {
  const f = service();
  f.native.displayNotification = async () => { throw Error('native unavailable'); };
  await assert.rejects(f.loaded.displayDriverInvitation(data));
  f.native.displayNotification = async value => f.displays.push(value);
  await f.loaded.displayDriverInvitation({ ...data, ringUntil: new Date(Date.now() + 5000).toISOString() });
  assert.equal(f.displays.length, 1);
  assert.ok(f.displays[0].android.timeoutAfter <= 5000);
});
test('iOS never redisplays a remote notification as a second local notification', async () => {
  const { loaded, displays } = service('ios');
  await loaded.displayDriverInvitation(data);
  assert.equal(displays.length, 0);
});

test('Android ignores an invitation belonging to a logged-out or different account', async () => {
  for (const account of [null, '00000000-0000-4000-8000-000000000099']) {
    const f = service('android', account);
    assert.equal(await f.loaded.displayDriverInvitation(data), true);
    assert.equal(f.displays.length, 0);
  }
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
