const test = require('node:test');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const { loader } = require('./helpers/loadTypeScript.cjs');
const load = loader();
const policy = load('features/notifications/driverInvitation.ts');
const { driverRingDeadline } = load('features/notifications/driverRinging.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const driverId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const data = { actionProtocol: 'driver-v1', type: 'driver_dispatch_offer', driverId, offerId: id, expiresAt: new Date(Date.now() + 30000).toISOString() };
// Keep each fixture's original deadline, independent of the whole suite duration.
test.beforeEach(() => { data.expiresAt = new Date(Date.now() + 30000).toISOString(); });

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

test('own request cannot be parsed as a nearby ring or an actionable driver invitation', () => {
  const sound = load('features/notifications/rideSound.ts');
  const nearby = { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', driverId, passengerId: driverId,
    tripRequestId: id, delivery: 'driver-phone-v3', ringUntil: new Date(Date.now() + 30000).toISOString() };
  assert.equal(sound.isRemoteNearbyRequestAlert(nearby), false);
  assert.equal(sound.parseNearbyPhoneAlert(nearby), null);
  assert.equal(policy.parseDriverInvitation({ ...data, passengerId: driverId }), null);
  assert.equal(policy.parseDriverInvitation({ ...data, passengerId: id }).kind, 'dispatch');
  assert.equal(sound.parseNearbyPhoneAlert({ ...nearby, passengerId: id }).kind, 'nearby');
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

test('nearby alert fields survive the plain body copied into dataString by Expo Android', () => {
  const nearby = { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3',
    driverId, tripRequestId: id, ringUntil: new Date(Date.now() + 30000).toISOString(), dataString: 'Un client près de vous' };
  for (const payload of [nearby, { data: nearby }, { notification: { data: nearby } },
    { request: { content: { data: nearby } } }, { data: { dataString: JSON.stringify(nearby) } }]) {
    assert.deepEqual(policy.readDriverPushData(payload), nearby);
    assert.equal(load('features/notifications/rideSound.ts').parseNearbyPhoneAlert(policy.readDriverPushData(payload)).id, id);
  }
  const malformed = { ...nearby, driverId: 'invalid' };
  assert.equal(load('features/notifications/rideSound.ts').parseNearbyPhoneAlert(policy.readDriverPushData({ data: malformed })), null);
});

function service(platform = 'android', account = driverId, phoneChannel = false, fullScreen = false) {
  const storage = new Map();
  const displays = [];
  const channels = [];
  const categories = [];
  const cancelled = [], presented = [], wakes = [];
  const appState = { currentState: 'background' };
  const native = { createChannel: async value => channels.push(value), displayNotification: async value => displays.push(value),
    cancelNotification: async id => cancelled.push(id), getDisplayedNotifications: async () => displays.map(notification => ({ id: notification.id, notification })) };
  const loaded = loader({
    './tokenStorage': { getTokens: async () => ({ refreshToken: account ? `x.${Buffer.from(JSON.stringify({ sub: account, exp: Date.now()/1000+3600 })).toString('base64url')}.x` : null }) },
    '@react-native-async-storage/async-storage': { getItem: async key => storage.get(key), setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key) },
    'expo-notifications': { setNotificationCategoryAsync: async id => { categories.push(id); },
      getPresentedNotificationsAsync: async () => presented, dismissNotificationAsync: async id => cancelled.push(id) },
    '@notifee/react-native': { __esModule: true, default: native, AndroidImportance: { HIGH: 4 }, AndroidVisibility: { PRIVATE: 0 }, AndroidStyle: { BIGTEXT: 'BIGTEXT' } },
    'react-native': { Platform: { OS: platform }, AppState: appState,
      NativeModules: { ZwangaDriverAlerts: { canLightUpAlertScreen: async () => true, canPresentFullScreen: async () => fullScreen,
        wakeDisplayedAlert: async (id, channel, deadline) => {
          assert.ok(displays.some(card => card.id === id), 'wake follows notification publication');
          wakes.push({ id, channel, deadline }); return 'requested';
        },
        ...(phoneChannel ? { ensureBundledChannel: async () => 'zwanga-ride-ring-v4' } : {}) } } },
  })('services/driverNotifications.ts');
  return { loaded, displays, storage, channels, categories, cancelled, appState, native, presented, wakes };
}

test('simultaneous socket and push share one card, deadline and acknowledgement', async () => {
  const f = service();
  const expiresAt = new Date(Date.now() + 20000).toISOString();
  const payload = { ...data, expiresAt, ringUntil: expiresAt };
  await Promise.all([f.loaded.displayDriverInvitation(payload), f.loaded.displayDriverInvitation({ ...payload })]);
  assert.equal(f.displays.length, 1);
  assert.equal(f.displays[0].data.expiresAt, expiresAt);
  await f.loaded.dismissDriverInvitation(policy.parseDriverInvitation(payload));
  await f.loaded.displayDriverInvitation(payload);
  assert.equal(f.displays.length, 1, 'a delayed duplicate never revives an answered card');
});

for (const operation of ['createChannel', 'cancelNotification', 'displayNotification']) {
  test(`foreground ${operation} timeout releases the invitation for a retry`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = service(); f.appState.currentState = 'active';
    const original = f.native[operation]; let finish;
    f.native[operation] = () => new Promise(resolve => { finish = resolve; });
    const first = f.loaded.displayDriverInvitation({ ...data, type: 'new_booking', bookingId: id, expiresAt: undefined });
    const rejected = assert.rejects(first, /RIDE_AUDIO_TIMEOUT/);
    await tick(); t.mock.timers.tick(8001); await rejected;
    f.native[operation] = original;
    await f.loaded.displayDriverInvitation({ ...data, type: 'new_booking', bookingId: id, expiresAt: undefined });
    assert.equal(f.displays.length, 1);
    const cancellations = f.cancelled.length;
    finish(); await tick();
    assert.equal(f.cancelled.length, cancellations, 'late completion cannot cancel the replacement');
  });
}

test('background timeout permits retry and removes a late card without touching its replacement', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const retry of [false, true]) {
    const f = service(); let finish;
    const payload = { ...data, type: 'new_booking', bookingId: id, expiresAt: undefined };
    const original = f.native.displayNotification;
    f.native.displayNotification = () => new Promise(resolve => { finish = resolve; });
    const work = f.loaded.displayDriverInvitation(payload);
    const rejected = assert.rejects(work, /RIDE_AUDIO_TIMEOUT/);
    await tick(); t.mock.timers.tick(8001); await rejected;
    if (retry) { f.native.displayNotification = original; await f.loaded.displayDriverInvitation(payload); }
    finish(); await tick();
    assert.equal(f.cancelled.includes(`driver-booking-${id}`), !retry);
    assert.equal(f.displays.length, retry ? 1 : 0);
  }
});

test('foreground initialization interrupted by sleep does not suppress background ringing and screen wake', async () => {
  const f = service(); f.appState.currentState = 'active';
  let finish; const original = f.native.createChannel;
  f.native.createChannel = () => new Promise(resolve => { finish = resolve; });
  const payload = { ...data, type: 'new_booking', bookingId: id, expiresAt: undefined };
  const first = f.loaded.displayDriverInvitation(payload);
  await tick(); f.appState.currentState = 'background'; f.native.createChannel = original; finish(); await first;
  assert.equal(f.displays.length, 1, 'the original event completes in background without a second push');
  await f.loaded.displayDriverInvitation(payload);
  assert.equal(f.displays.length, 1);
  assert.equal(f.displays[0].android.lightUpScreen, false);
  assert.equal(f.wakes.length, 1);
});

test('sleeping Android without fullscreen consent keeps screen wake and the usual notification', async () => {
  for (const payload of [
    { type: 'new_booking', actionProtocol: 'driver-v1', bookingId: id, driverId },
    { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3',
      tripRequestId: id, driverId, ringUntil: new Date(Date.now() + 30000).toISOString() },
  ]) {
    const f = service(); await f.loaded.displayDriverInvitation(payload);
    assert.equal(f.displays[0].android.lightUpScreen, false);
    assert.equal(f.wakes.length, 1);
    assert.equal(f.displays[0].android.fullScreenAction, undefined);
  }
});

test('eligible Android test builds attach the private full-screen action only to fresh background alerts', async () => {
  for (const payload of [
    { ...data, expiresAt: new Date(Date.now() + 30000).toISOString() },
    { type: 'new_booking', actionProtocol: 'driver-v1', bookingId: id, driverId },
    { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3',
      tripRequestId: id, driverId, ringUntil: new Date(Date.now() + 30000).toISOString() },
  ]) {
    for (const appState of ['active', 'background']) {
      const f = service('android', driverId, true, true); f.appState.currentState = appState;
      await f.loaded.displayDriverInvitation(payload);
      assert.equal(f.displays.length, 1);
      assert.equal(f.displays[0].android.fullScreenAction?.launchActivity,
        appState === 'background' ? 'com.zwanga.notifications.IncomingRideActivity' : undefined);
      assert.equal(f.displays[0].android.visibility, 0);
    }
  }
});

test('v4 late booking retains a quiet actionable card; a successful card removes only its native backup', async () => {
  const f = service();
  const payload = { ...data, type: 'new_booking', bookingId: id, expiresAt: undefined,
    ringUntil: new Date(0).toISOString(), alertDelivery: 'native-backup-v4', fallbackTag: `ride-backup-booking-${id}` };
  await f.loaded.displayDriverInvitation(payload);
  assert.equal(f.displays.length, 1);
  assert.equal(f.displays[0].android.channelId, 'driver-bookings-active-v1');
  assert.equal(f.displays[0].android.sound, undefined);
  assert.equal(f.displays[0].android.timeoutAfter, undefined);
  assert.equal(f.displays[0].android.lightUpScreen, false);
  assert.equal(f.displays[0].android.actions.length, 2);
  assert.deepEqual(f.cancelled, [payload.fallbackTag]);
  const failing = service(); failing.native.displayNotification = async () => { throw Error('native unavailable'); };
  await assert.rejects(failing.loaded.displayDriverInvitation(payload));
  assert.deepEqual(failing.cancelled, [], 'a failed rich card must not remove the backup');
});

test('own incoming requests stay silent in foreground and headless delivery on both platforms', async () => {
  for (const platform of ['android', 'ios']) for (const state of ['active', 'background']) {
    const f = service(platform); f.appState.currentState = state;
    for (const push of [{ ...data, passengerId: driverId },
      { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3',
        driverId, passengerId: driverId, tripRequestId: id, ringUntil: new Date(Date.now() + 30000).toISOString() }]) {
      assert.equal(await f.loaded.displayDriverInvitation(push), false);
    }
    assert.deepEqual(f.displays, []); assert.deepEqual(f.channels, []); assert.equal(f.storage.size, 0);
  }
});

test('long-ring channel is configured independently of recipient role before capability registration', async () => {
  const { loaded, channels, categories } = service('android', null);
  await loaded.configureDriverNotifications();
  assert.equal(channels.length, 1);
  assert.equal(channels[0].id, 'booking-ring-v2');
  assert.equal(channels[0].sound, 'driver_ring');
  assert.equal(channels[0].importance, 4);
  assert.equal(channels[0].vibration, true);
  assert.deepEqual(categories, [], 'Android background alerts do not wait for APNs category initialization');
});

test('iOS registers reservation/dispatch and nearby actionable notification categories', async () => {
  const f = service('ios', null); await f.loaded.configureDriverNotifications();
  assert.deepEqual(f.categories, ['driver-offer-v1', 'driver-offer-v2', 'driver-nearby-v1']);
});

test('a new background request attempts screen wake after the previous request was dismissed', async () => {
  const f = service(); await f.loaded.displayDriverInvitation(data);
  await f.loaded.dismissDriverInvitation(policy.parseDriverInvitation(data));
  await f.loaded.displayDriverInvitation(data);
  await f.loaded.displayDriverInvitation({ ...data, offerId: '00000000-0000-4000-8000-000000000003' });
  assert.equal(f.displays.length, 2, 'only the distinct second event may ring/wake again');
  for (const notification of f.displays) {
    assert.equal(notification.android.lightUpScreen, false);
    assert.equal(notification.android.fullScreenAction, undefined);
  }
  assert.deepEqual(f.wakes.map(wake => wake.id), f.displays.map(card => card.id));
});
test('headless Android uses one stable id, actions, expiry and private lockscreen content', async () => {
  const { loaded, displays, wakes } = service();
  await Promise.all([loaded.displayDriverInvitation(data), loaded.displayDriverInvitation(data)]);
  assert.equal(displays.length, 1, 'duplicate delivery must not restart the native timeout');
  assert.equal(displays[0].id, `driver-dispatch-${id}`);
  assert.equal(displays[0].android.visibility, 0);
  assert.equal(displays[0].android.onlyAlertOnce, true);
  assert.equal(displays[0].android.channelId, 'booking-ring-v2');
  assert.equal(displays[0].android.sound, 'driver_ring');
  assert.equal(displays[0].android.loopSound, false);
  assert.equal(displays[0].android.autoCancel, false);
  assert.equal(displays[0].android.ongoing, undefined);
  assert.equal(displays[0].android.lightUpScreen, false);
  assert.equal(wakes.length, 1);
  assert.ok(displays[0].android.actions.every(action => action.pressAction.launchActivity === 'default'));
  assert.deepEqual(displays[0].android.actions.map(a => a.pressAction.id), ['driver-decline', 'driver-accept']);
  assert.ok(displays[0].android.timeoutAfter > 0);
  assert.ok(displays[0].android.timeoutAfter <= 30000);
  await loaded.displayDriverInvitation({ ...data, expiresAt: new Date(0).toISOString() });
  assert.equal(displays.length, 1);
});

test('foreground and background cards carry the same price/destination and launchable actions without additional reads', async () => {
  for (const state of ['active', 'background']) {
    const f = service(); f.appState.currentState = state;
    await f.loaded.displayDriverInvitation({ ...data, ridePricePerSeat: '5600', ridePriceKind: 'budget',
      rideDeparture: 'Place centrale', rideArrival: 'Gare', rideSeats: '2' });
    const card = f.displays[0];
    assert.match(card.body.replace(/[\u202f\u00a0]/g, ' '), /Budget : 5 600 FC \/ place/);
    assert.match(card.body, /Place centrale → Gare/);
    assert.equal(card.android.style.text, card.body);
    assert.equal(card.data.ridePricePerSeat, '5600');
    assert.equal(card.android.visibility, 0, 'retain private lock-screen content');
    assert.ok(card.android.actions.every(a => a.pressAction.launchActivity === 'default'));
  }
});

test('new native binaries use the bundled channel for booking and dispatch and stop after a decision', async () => {
  for (const payload of [data, { ...data, type: 'new_booking', bookingId: id, expiresAt: undefined }]) {
    const f = service('android', driverId, true);
    await f.loaded.displayDriverInvitation(payload);
    assert.equal(f.displays[0].android.channelId, 'zwanga-ride-ring-v4');
    assert.equal(f.displays[0].android.loopSound, false);
    if (payload.type === 'new_booking') assert.equal(f.displays[0].android.timeoutAfter, undefined);
    else assert.ok(f.displays[0].android.timeoutAfter <= 30000);
    assert.equal(f.displays[0].android.actions.length, 2);
    f.appState.currentState = 'active';
    await f.loaded.dismissDriverDecision(driverId, payload.type === 'new_booking' ? 'booking' : 'dispatch', id);
    assert.deepEqual(f.cancelled, [`ride-backup-${payload.type === 'new_booking' ? 'booking' : 'dispatch'}-${id}`, f.displays[0].id, `ride-handoff-${f.displays[0].id}`]);
  }
});

test('v3 scheduled orders ring once for at most 30s, without exclusive accept/decline actions', async () => {
  const payload = { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3',
    driverId, tripRequestId: id, ringUntil: new Date(Date.now() + 5000).toISOString() };
  const f = service('android', driverId, true);
  await Promise.all([f.loaded.displayDriverInvitation(payload), f.loaded.displayDriverInvitation(payload)]);
  assert.equal(f.displays.length, 1);
  assert.equal(f.displays[0].android.channelId, 'zwanga-ride-ring-v4');
  assert.deepEqual(f.displays[0].android.actions.map(a => a.pressAction.id), ['driver-ignore-nearby', 'driver-review-nearby']);
  assert.equal(f.displays[0].android.timeoutAfter, undefined, 'keep the request card after the single clip');
  assert.equal(f.displays[0].android.loopSound, false);
  f.appState.currentState = 'active';
  await f.loaded.dismissDriverDecision(driverId, 'nearby', id);
  assert.ok(f.cancelled.includes(`driver-nearby-${id}`));
  f.appState.currentState = 'background';
  await f.loaded.displayDriverInvitation(payload);
  assert.equal(f.displays.length, 1);
  for (const platform of ['ios', 'android']) {
    const other = service(platform, 'other-user', true);
    await other.loaded.displayDriverInvitation(payload);
    assert.equal(other.displays.length, 0);
  }
  const expired = service('android', driverId, true);
  await expired.loaded.displayDriverInvitation({ ...payload, ringUntil: new Date(0).toISOString() });
  assert.equal(expired.displays.length, 0);
});

test('booking plays one finite clip without removing its card; late legacy rings are ignored', async () => {
  const f = service();
  const booking = { ...data, type: 'new_booking', bookingId: id, expiresAt: undefined };
  await f.loaded.displayDriverInvitation({ ...booking, ringUntil: new Date(0).toISOString() });
  assert.equal(f.displays.length, 0);
  await f.loaded.displayDriverInvitation(booking);
  assert.equal(f.displays[0].android.timeoutAfter, undefined);
  assert.equal(f.displays[0].android.loopSound, false);
});

test('foreground dispatch uses an audio handoff banner without restarting on background duplicates', async () => {
  const f = service();
  f.appState.currentState = 'active';
  await f.loaded.displayDriverInvitation(data);
  assert.equal(f.displays.length, 1);
  f.appState.currentState = 'background';
  await f.loaded.displayDriverInvitation(data);
  assert.equal(f.displays.length, 1);
});

test('a confirmed decision cancels only this account invitation without replaying duplicates', async () => {
  const f = service();
  await f.loaded.displayDriverInvitation(data);
  f.displays.push({ id: 'chat', data: { type: 'message' } });
  f.displays.push({ id: 'foreign', data: { ...data, driverId: '00000000-0000-4000-8000-000000000099' } });
  f.appState.currentState = 'active';
  await f.loaded.dismissDriverDecision(driverId, 'dispatch', id);
  assert.deepEqual(f.cancelled, [`ride-backup-dispatch-${id}`, `driver-dispatch-${id}`, `ride-handoff-driver-dispatch-${id}`]);
  f.appState.currentState = 'background';
  await f.loaded.displayDriverInvitation(data);
  assert.equal(f.displays.length, 3, 'dismissed notification must not ring on redelivery');
});

test('iOS decision dismisses only the matching remote alert, never messages or another booking', async () => {
  const f = service('ios');
  f.presented.push({ request: { identifier: 'apns-incoming', content: { data } } },
    { request: { identifier: 'apns-chat', content: { data: { type: 'message' } } } });
  f.appState.currentState = 'active';
  await f.loaded.dismissDriverDecision(driverId, 'dispatch', id);
  assert.deepEqual(f.cancelled, [`driver-dispatch-${id}`, 'apns-incoming']);
});

test('opening while native display is pending hands off its sound to the foreground player', async () => {
  const f = service();
  f.native.displayNotification = async value => { f.displays.push(value); f.appState.currentState = 'active'; };
  await f.loaded.displayDriverInvitation(data);
  assert.deepEqual(f.cancelled, [`driver-dispatch-${id}`]);
  assert.equal(f.displays.at(-1).android.channelId, 'driver-bookings-active-v1');
});

test('ignoring a scheduled nearby alert silences only this recipient without accepting', async () => {
  const nearby = { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', driverId, tripRequestId: id };
  for (const platform of ['android', 'ios']) {
    const f = service(platform);
    const cards = [{ id: 'nearby', data: nearby }, { id: 'chat', data: { type: 'message' } },
      { id: 'foreign', data: { ...nearby, driverId: '00000000-0000-4000-8000-000000000099' } }];
    if (platform === 'android') f.displays.push(...cards);
    else f.presented.push(...cards.map(card => ({ request: { identifier: card.id, content: { data: card.data } } })));
    f.appState.currentState = 'active';
    await f.loaded.dismissDriverDecision(driverId, 'nearby', id);
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

test('foreground bookings use one silent Android banner with direct actions, not the ringing channel', async () => {
  const payload = { ...data, type: 'new_booking', bookingId: id, expiresAt: undefined };
  const f = service(); f.appState.currentState = 'active';
  await Promise.all([f.loaded.displayDriverInvitation(payload), f.loaded.displayDriverInvitation(payload)]);
  assert.equal(f.displays.length, 1);
  assert.equal(f.displays[0].android.channelId, 'driver-bookings-active-v1');
  assert.equal(f.displays[0].android.loopSound, undefined);
  assert.equal(f.displays[0].android.sound, undefined);
  assert.equal(f.channels[0].sound, undefined); assert.equal(f.channels[0].vibration, false);
  assert.deepEqual(f.displays[0].android.actions.map(action => action.pressAction.id), ['driver-decline', 'driver-accept']);
  assert.equal(f.storage.size, 0, 'delivery does not create a decision');
  await f.loaded.dismissDriverDecision(driverId, 'booking', id);
  assert.ok(f.cancelled.every(value => [`ride-backup-booking-${id}`, `driver-booking-${id}`, `ride-handoff-driver-booking-${id}`].includes(value)));
  f.appState.currentState = 'background'; await f.loaded.displayDriverInvitation(payload);
  assert.equal(f.displays.length, 1, 'acknowledged receipt must not start ringing later');
  const ios = service('ios'); ios.appState.currentState = 'active';
  await ios.loaded.displayDriverInvitation(payload); assert.equal(ios.displays.length, 0);
  const wrong = service('android', 'another-user'); wrong.appState.currentState = 'active';
  await wrong.loaded.displayDriverInvitation(payload); assert.equal(wrong.displays.length, 0);
});

test('nearby Android foreground delivery remains visible, silent and deduplicated without accepting the order', async () => {
  const payload = { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3',
    driverId, tripRequestId: id, ringUntil: new Date(Date.now() + 30000).toISOString() };
  const f = service('android', driverId, true); f.appState.currentState = 'active';
  const nativePayload = policy.readDriverPushData({ data: { ...payload, dataString: 'Un client près de vous' } });
  await Promise.all([f.loaded.displayDriverInvitation(nativePayload), f.loaded.displayDriverInvitation(nativePayload)]);
  assert.equal(f.displays.length, 1);
  assert.equal(f.displays[0].title, 'Zwanga · Demande près de vous');
  assert.equal(f.displays[0].android.channelId, 'driver-bookings-active-v1');
  assert.equal(f.displays[0].android.loopSound, undefined);
  assert.equal(f.displays[0].android.sound, undefined);
  assert.deepEqual(f.displays[0].android.actions.map(a => a.pressAction.id), ['driver-ignore-nearby', 'driver-review-nearby'], 'local ignore/review never accepts the order');
  assert.equal(f.channels[0].sound, undefined); assert.equal(f.channels[0].vibration, false);
  assert.equal(f.storage.size, 0);
  f.appState.currentState = 'background';
  await f.loaded.displayDriverInvitation(payload);
  assert.equal(f.displays.length, 1, 'foreground delivery cannot ring later on a duplicate');
  for (const account of [null, '00000000-0000-4000-8000-000000000099']) {
    const other = service('android', account, true); other.appState.currentState = 'active';
    await other.loaded.displayDriverInvitation(payload); assert.equal(other.displays.length, 0);
  }
  const expired = service(); expired.appState.currentState = 'active';
  await expired.loaded.displayDriverInvitation({ ...payload, ringUntil: new Date(0).toISOString() });
  assert.equal(expired.displays.length, 0);
  const ios = service('ios'); ios.appState.currentState = 'active';
  await ios.loaded.displayDriverInvitation(payload); assert.equal(ios.displays.length, 0);
});

test('Android ignores an invitation belonging to a logged-out or different account', async () => {
  for (const account of [null, '00000000-0000-4000-8000-000000000099']) {
    const f = service('android', account);
    assert.equal(await f.loaded.displayDriverInvitation(data), true);
    assert.equal(f.displays.length, 0);
  }
});

test('a refreshed booking list stops resolved bookings in a single native read, preserving unrelated alerts', async () => {
  const f = service();
  const booking = { ...data, type: 'new_booking', bookingId: id, expiresAt: undefined };
  await f.loaded.displayDriverInvitation(booking);
  f.displays.push({ id: 'foreign', data: { ...booking, driverId: '00000000-0000-4000-8000-000000000099' } });
  f.displays.push({ id: 'chat', data: { type: 'message' } });
  let reads = 0;
  f.native.getDisplayedNotifications = async () => { reads++; return f.displays.map(notification => ({ id: notification.id, notification })); };
  await f.loaded.dismissResolvedDriverBookings(driverId, [id, ...Array.from({ length: 50 }, (_, i) => `unrelated-${i}`)]);
  assert.equal(reads, 1);
  assert.deepEqual(f.cancelled, [`driver-booking-${id}`]);
  await f.loaded.displayDriverInvitation(booking);
  assert.equal(f.displays.length, 3, 'a duplicate cannot ring after the server marks the booking as resolved');
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
