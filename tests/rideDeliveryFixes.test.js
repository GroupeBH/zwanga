const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { Buffer } = require('node:buffer');
const user = '00000000-0000-4000-8000-000000000001';
const notificationId = '00000000-0000-4000-8000-000000000002';
const tick = () => new Promise(resolve => setImmediate(resolve));

test('native registration requires the current refresh identity and invalidates before a late read', async () => {
  let version = 0, finish, bound = [];
  const token = `x.${Buffer.from(JSON.stringify({ sub: user, exp: Math.floor(Date.now()/1000)+60 })).toString('base64url')}.x`;
  const load = loader({ 'react-native': { Platform: { OS: 'android' }, NativeModules: { ZwangaDriverAlerts: {
    bindNativeRideAccount: (...args) => { bound.push(args); return 6; } } } },
    './tokenStorage': { getTokens: () => new Promise(resolve => { finish = resolve; }) },
    './tokenSession': { getTokenSessionVersion: () => version } });
  const { bindNativeRideDelivery } = load('services/nativeRideDelivery.ts');
  const old = bindNativeRideDelivery(user, 'ring'); version++; finish({ refreshToken: token });
  assert.equal(await old, false); assert.equal(bound.length, 0);
  const next = bindNativeRideDelivery(user, 'ring'); finish({ refreshToken: token });
  assert.equal(await next, true); assert.equal(bound[0][0], user);
});

test('received/displayed receipts are separate, coalesced and never sent for another account', async () => {
  const io = { account: user, version: 1, sent: [], reset: 0, reject: false };
  const load = loader({ 'react-native': { NativeModules: {} },
    './tokenSession': { getTokenSessionVersion: () => io.version },
    '@/store': { store: { getState: () => ({ auth: { user: { id: io.account } } }), dispatch: args => {
      io.sent.push(args); return { unwrap: async () => { if (io.reject) throw { status: 500 }; return { received: true }; },
        abort() {}, reset() { io.reset++; } }; } } },
    '@/store/api/driverDispatchApi': { driverDispatchApi: { endpoints: { recordRideNotificationReceipt: { initiate: args => args } } } } });
  const { reportRideNotificationReceipt: report } = load('services/rideNotificationReceipt.ts');
  const data = { driverId: user, notificationId };
  await Promise.all([report(data, 'received'), report(data, 'received')]);
  await report(data, 'received'); await report(data, 'displayed');
  assert.deepEqual(io.sent.map(x => x.stage), ['received', 'displayed']);
  io.version++; io.account = 'other'; await report(data, 'received'); assert.equal(io.sent.length, 2);
  io.version++; io.account = user; io.reject = true;
  await report(data, 'received'); await report(data, 'received');
  assert.equal(io.sent.length, 3, 'transient error imposes backoff'); assert.equal(io.reset, 3);
});

test('older Android audio bridge uses one OS-managed card, keeps actions and never starts an Expo media player', async () => {
  const shown = [], cancelled = [];
  const card = { id: 'driver-booking-test', title: 'Zwanga', data: { ringUntil: new Date(Date.now()+60000).toISOString() },
    android: { channelId: 'quiet', actions: [{ title: 'Accepter' }] } };
  const load = loader({ 'react-native': { Platform: { OS: 'android' }, NativeModules: {}, Vibration: {} },
    '@notifee/react-native': { getNotificationSettings: async () => ({ authorizationStatus: 1 }),
      getChannel: async () => ({ sound: 'driver_ring', importance: 4 }), getDisplayedNotifications: async () => [{ notification: card }],
      displayNotification: async data => shown.push(data), cancelNotification: async id => cancelled.push(id) },
    './driverAlertChannel': { getDriverAlertChannel: async () => 'system-ring' }, './appActivity': { isAppActive: () => true } });
  const sound = load('services/foregroundRideSound.ts');
  assert.equal(await sound.canPlayForegroundRideAudio(), false, 'voice cannot bypass a missing DND probe');
  await sound.startForegroundRideSound(card.id); await tick();
  assert.equal(shown.length, 1); assert.equal(shown[0].id, card.id);
  assert.equal(shown[0].android.channelId, 'system-ring'); assert.deepEqual(shown[0].android.actions, card.android.actions);
  await sound.startForegroundRideSound(card.id); assert.equal(shown.length, 1);
  sound.stopForegroundRideSound(); await tick(); assert.ok(cancelled.includes(card.id));
});

test('messaging service registration replaces Expo once and keeps unrelated services intact', () => {
  const { registerMessagingService } = require('../plugins/withDriverAlertSources');
  const manifest = { manifest: { $: {}, application: [{ service: [{ $: { 'android:name': 'Unrelated' } }] }] } };
  registerMessagingService(manifest); const once = JSON.stringify(manifest);
  registerMessagingService(manifest); assert.equal(JSON.stringify(manifest), once);
  const services = manifest.manifest.application[0].service;
  assert.equal(services.filter(s => s['intent-filter']).length, 1);
  assert.ok(services.some(s => s.$['android:name'] === 'Unrelated'));
  assert.equal(services.find(s => s.$['android:name'].includes('ExpoFirebase')).$['tools:node'], 'remove');
});
