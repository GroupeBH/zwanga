const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(platform = 'android') {
  const calls = [];
  const io = { status: 'denied', canAskAgain: true, nextStatus: 'granted', active: 'active', fail: false,
    receive: null, stored: null, request: null };
  const service = loader({
    'expo-constants': { appOwnership: 'standalone', expoConfig: { extra: { eas: { projectId: 'test-project' } } } },
    'react-native': { Platform: { OS: platform }, AppState: { get currentState() { return io.active; } } },
    './tokenStorage': { getStoredFcmToken: async () => io.stored, storeFcmToken: async value => { io.stored = value; } },
    'expo-notifications': {
      AndroidImportance: { MAX: 5 },
      setNotificationChannelAsync: async (id, config) => { calls.push(['channel', id, config]); },
      getPermissionsAsync: async () => {
        calls.push(['permissions']); return { status: io.status, canAskAgain: io.canAskAgain };
      },
      requestPermissionsAsync: async () => {
        calls.push(['prompt']);
        if (io.fail) throw Error('No activity');
        if (io.request) await io.request;
        io.status = io.nextStatus; return { status: io.status };
      },
      getDevicePushTokenAsync: async () => { calls.push(['fcm']); return { data: 'test-fcm' }; },
      getExpoPushTokenAsync: async options => { calls.push(['expo', options]); return { data: 'test-expo' }; },
      addPushTokenListener: fn => { io.receive = fn; return { remove: () => { io.receive = null; } }; },
    },
  })('services/pushNotifications.ts');
  return { service, io, calls, prompts: () => calls.filter(call => call[0] === 'prompt').length };
}

test('fresh Android setup prepares a channel before the OS prompt and FCM token, without a settings screen', async () => {
  const f = fixture();
  assert.equal(await f.service.obtainFcmToken(), 'test-fcm');
  assert.deepEqual(f.calls.map(call => call[0]), ['channel', 'permissions', 'prompt', 'fcm']);
  assert.equal(f.calls[0][1], 'zwanga_default');
  assert.equal(f.calls[0][2].sound, 'default');
  assert.equal(f.io.stored, 'test-fcm');
});

test('a transient native permission failure can retry automatically', async () => {
  const f = fixture(); f.io.fail = true;
  assert.equal(await f.service.obtainFcmToken(), null);
  f.io.fail = false;
  assert.equal(await f.service.obtainFcmToken(), 'test-fcm');
  assert.equal(f.prompts(), 2);
});

test('concurrent requests share one OS prompt', async () => {
  const f = fixture(); let resolve;
  f.io.request = new Promise(done => { resolve = done; });
  const first = f.service.obtainFcmToken(), second = f.service.obtainFcmToken();
  await tick(); assert.equal(f.prompts(), 1);
  resolve(); assert.deepEqual(await Promise.all([first, second]), ['test-fcm', 'test-fcm']);
});

test('denial or dismissal does not prompt repeatedly; a later settings grant is detected', async () => {
  for (const nextStatus of ['denied', 'undetermined']) {
    const f = fixture(); f.io.nextStatus = nextStatus;
    assert.equal(await f.service.obtainFcmToken(), null);
    assert.equal(await f.service.obtainFcmToken(), null);
    assert.equal(f.prompts(), 1);
    assert.equal(f.calls.some(call => call[0] === 'fcm'), false);
    f.io.status = 'granted';
    assert.equal(await f.service.obtainFcmToken(), 'test-fcm');
    assert.equal(f.prompts(), 1);
  }
});

test('blocked permission and background state never trigger an OS prompt', async () => {
  const f = fixture(); f.io.canAskAgain = false;
  assert.equal(await f.service.obtainFcmToken(), null);
  f.io.canAskAgain = true; f.io.active = 'background';
  assert.equal(await f.service.obtainFcmToken(), null);
  assert.equal(f.prompts(), 0);
  f.io.active = 'active';
  assert.equal(await f.service.obtainFcmToken(), 'test-fcm');
  assert.equal(f.prompts(), 1);
});

test('native token refresh only checks existing permission, including outside the foreground', async () => {
  const f = fixture(); const received = [];
  const unsubscribe = f.service.subscribeToFcmRefresh(token => { received.push(token); });
  f.io.receive(); await tick();
  assert.equal(f.prompts(), 0); assert.deepEqual(received, []);
  f.io.status = 'granted'; f.io.active = 'background';
  f.io.receive(); await tick();
  assert.deepEqual(received, ['test-fcm']); assert.equal(f.prompts(), 0);
  unsubscribe(); assert.equal(f.io.receive, null);
});

test('iOS preserves Expo push transport without creating Android channels', async () => {
  const f = fixture('ios'); f.io.status = 'undetermined';
  assert.equal(await f.service.obtainFcmToken(), 'test-expo');
  assert.deepEqual(f.calls.map(call => call[0]), ['permissions', 'prompt', 'expo']);
  assert.deepEqual(f.calls[2][1], { projectId: 'test-project' });
});
