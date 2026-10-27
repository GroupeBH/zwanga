const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

function storageFixture(disk = new Map(), secure = new Map()) {
  const io = { failWrite: false };
  const load = loader({
    '@react-native-async-storage/async-storage': {
      getItem: async key => disk.get(key) ?? null,
      setItem: async (key, value) => { if (io.failWrite) throw Error('disk unavailable'); disk.set(key, value); },
    },
    'expo-secure-store': { getItemAsync: async key => secure.get(key) ?? null, setItemAsync: async (key, value) => { secure.set(key, value); } },
  });
  return { disk, secure, io, service: load('services/installationAnnouncements.ts') };
}

test('announcement consent and an anonymous installation survive restart independently of account tokens', async () => {
  const f = storageFixture(); await f.service.loadAnnouncementPreference();
  assert.equal(f.service.announcementPreference().enabled, false);
  await f.service.setAnnouncementPreference(true);
  const [a, b] = await Promise.all([f.service.getAnnouncementIdentity(), f.service.getAnnouncementIdentity()]);
  assert.deepEqual(a, b); assert.equal(a.secret.length, 64);
  const sequence = await f.service.nextAnnouncementSequence();
  const next = storageFixture(f.disk, f.secure); await next.service.loadAnnouncementPreference();
  assert.equal(next.service.announcementPreference().enabled, true);
  assert.deepEqual(await next.service.getAnnouncementIdentity(), a);
  assert.ok(await next.service.nextAnnouncementSequence() > sequence);
});

test('failed preference storage never claims consent, and rapid choices are persisted in order', async () => {
  const f = storageFixture(); await f.service.loadAnnouncementPreference(); f.io.failWrite = true;
  await assert.rejects(f.service.setAnnouncementPreference(true));
  assert.equal(f.service.announcementPreference().enabled, false);
  f.io.failWrite = false;
  await Promise.all([f.service.setAnnouncementPreference(true), f.service.setAnnouncementPreference(false)]);
  assert.equal(f.service.announcementPreference().enabled, false);
  const next = storageFixture(f.disk, f.secure); await next.service.loadAnnouncementPreference();
  assert.equal(next.service.announcementPreference().enabled, false);
});

function syncFixture(t) {
  const h = hookHarness(), calls = [], timeouts = new Map(), intervals = new Map(); let timerId = 0, sequence = 0, rotate;
  const io = { active: true, online: true, permission: 'granted', token: 'synthetic-device-token',
    preference: { loaded: true, chosen: true, enabled: true, revision: 1 },
    respond: async body => ({ registered: true, enabled: body.enabled }), aborts: 0, tokenReads: [] };
  t.mock.method(global, 'setTimeout', (callback, ms) => { timeouts.set(++timerId, { callback, ms }); return timerId; });
  t.mock.method(global, 'clearTimeout', id => timeouts.delete(id));
  t.mock.method(global, 'setInterval', (callback, ms) => { intervals.set(++timerId, { callback, ms }); return timerId; });
  t.mock.method(global, 'clearInterval', id => intervals.delete(id));
  const mutation = body => {
    calls.push(body);
    return { unwrap: () => io.respond(body), reset() {}, abort() { io.aborts++; } };
  };
  const hook = loader({
    react: { ...h.react, useSyncExternalStore: (_subscribe, read) => read() },
    '@/hooks/useAppIsActive': { useAppIsActive: () => io.active },
    '@/store/hooks': { useAppSelector: select => select({ zwangaApi: { config: { online: io.online } } }) },
    '@/features/app-updates/nativeVersion': { readInstalledApp: () => ({ platform: 'android', version: '1.0.0', build: '10' }) },
    '@/store/api/installationUpdatesApi': { useSyncInstallationUpdatesMutation: () => [mutation] },
    'expo-notifications': { getPermissionsAsync: async () => ({ status: io.permission }) },
    '@/services/installationAnnouncements': {
      announcementPreference: () => io.preference, subscribeAnnouncementPreference() {}, loadAnnouncementPreference: async () => {},
      getAnnouncementIdentity: async () => ({ id: 'synthetic-installation', secret: 'synthetic-test-secret' }),
      nextAnnouncementSequence: async () => ++sequence,
    },
    '@/services/pushNotifications': {
      obtainFcmToken: async options => { io.tokenReads.push(options); return io.token; },
      subscribeToFcmRefresh: callback => { rotate = callback; return () => {}; },
    },
  })('hooks/useInstallationUpdates.ts').useInstallationUpdates;
  t.after(() => h.unmount());
  return { io, calls, intervals, render: () => h.render(hook), rotate: () => rotate('new'),
    start: async () => { for (const [id, timer] of timeouts) if (timer.ms === 1500) { timeouts.delete(id); timer.callback(); } await flush(); },
    retry: async () => { for (const timer of intervals.values()) timer.callback(); await flush(); } };
}

test('guest sync has no account dependency, never prompts, and does not repeat a successful registration', async t => {
  const f = syncFixture(t); f.render(); await f.start();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].enabled, true);
  assert.equal(f.calls[0].secret, undefined, 'installation credential stays out of Redux mutation arguments');
  assert.equal(f.calls[0].userId, undefined); assert.deepEqual(f.io.tokenReads, [{ requestPermission: false }]);
  await f.retry(); assert.equal(f.calls.length, 1);
  f.io.active = false; f.render(); f.io.active = true; f.render(); await f.start();
  assert.equal(f.calls.length, 1);
});

test('offline intent and a transient HTTP failure retry without blocking authentication', async t => {
  const f = syncFixture(t); f.io.online = false; f.render(); await f.start(); assert.equal(f.calls.length, 0);
  f.io.online = true; f.io.respond = async () => { throw Error('network'); }; f.render(); await f.start();
  assert.equal(f.calls.length, 1);
  f.io.respond = async body => ({ registered: true, enabled: body.enabled }); await f.retry();
  assert.equal(f.calls.length, 2); assert.ok(f.calls[1].sequence > f.calls[0].sequence);
});

test('token lookup failure is retried, while explicit OS revocation disables delivery', async t => {
  const f = syncFixture(t); f.io.token = null; f.render(); await f.start(); assert.equal(f.calls.length, 0);
  f.io.token = 'recovered-token'; await f.retry(); assert.equal(f.calls[0].enabled, true);
  f.io.active = false; f.render(); f.io.permission = 'denied'; f.io.active = true; f.render(); await f.start();
  assert.equal(f.calls.at(-1).enabled, false); assert.equal(f.calls.at(-1).pushToken, undefined);
});

test('a newer opt-out cancels an in-flight registration and has a higher durable sequence', async t => {
  const f = syncFixture(t); let complete;
  f.io.respond = body => new Promise(resolve => { complete = () => resolve({ registered: true, enabled: body.enabled }); });
  f.render(); await f.start(); assert.equal(f.calls.length, 1);
  f.io.preference = { ...f.io.preference, enabled: false, revision: 2 }; f.render();
  f.io.respond = async body => ({ registered: true, enabled: body.enabled }); await f.start(); complete(); await flush();
  assert.ok(f.io.aborts >= 1); assert.equal(f.calls.at(-1).enabled, false);
  assert.ok(f.calls.at(-1).sequence > f.calls[0].sequence);
});

test('token rotation synchronizes the latest token without granting notifications to an undecided visitor', async t => {
  const f = syncFixture(t); f.io.preference = { ...f.io.preference, chosen: false }; f.render(); await f.start();
  assert.equal(f.calls.length, 0);
  f.io.preference = { ...f.io.preference, chosen: true }; f.render(); await f.start();
  f.io.token = 'rotated-token'; f.rotate(); await flush();
  assert.equal(f.calls.at(-1).pushToken, 'rotated-token'); assert.equal(f.calls.length, 2);
});
