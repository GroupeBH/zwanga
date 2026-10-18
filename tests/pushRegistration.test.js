const test = require('node:test');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const jwt = account => `x.${Buffer.from(JSON.stringify({ sub: account })).toString('base64url')}.x`;

function fixture(platform = 'android') {
  const hooks = hookHarness();
  const io = { enabled: true, account: 'a', token: 'device', registered: false, setupFails: false,
    updates: 0, registrations: 0, resets: 0, version: 0, receive: null, backgroundReady: true,
    channel: 'booking-ring-v2', capabilities: [], rejectV3: null };
  const update = () => ({ unwrap: async () => { io.updates++; } });
  const dispatch = capability => ({ unwrap: async () => {
    io.capabilities.push(capability); io.registrations++;
    if (capability === 3 && io.rejectV3) throw { status: io.rejectV3 };
    return { registered: io.registered };
  }, reset: () => { io.resets++; } });
  const { usePushRegistration } = loader({ react: hooks.react,
    'react-native': { Platform: { OS: platform } },
    '@/hooks/useAppIsActive': { useAppIsActive: () => io.enabled },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: value => value && io.enabled },
    '@/store/hooks': { useAppDispatch: () => dispatch },
    '@/store/api/userApi': { useUpdateFcmTokenMutation: () => [update] },
    '@/store/api/driverDispatchApi': { driverDispatchApi: { endpoints: { registerDriverNotifications: { initiate: version => version } } } },
    '@/services/pushNotifications': { obtainFcmToken: async () => io.token, subscribeToFcmRefresh: fn => { io.receive = fn; return () => { io.receive = null; }; } },
    '@/services/driverNotifications': { configureDriverNotifications: async () => { if (io.setupFails) throw Error('not ready'); return io.channel; } },
    '@/services/backgroundNotificationTask': { registerBackgroundNotificationTask: async () => io.backgroundReady },
    '@/services/tokenSession': { getTokenSessionVersion: () => io.version },
  })('hooks/auth/usePushRegistration.ts');
  return { io, hooks, render: () => hooks.render(() => usePushRegistration(Boolean(io.account), io.account ? jwt(io.account) : null)) };
}

for (const failure of ['setup', 'registered:false']) test(`interactive push retries ${failure} independently of successful token registration`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(); f.io.setupFails = failure === 'setup'; f.render();
  t.mock.timers.tick(1200); await tick(); assert.equal(f.io.updates, 1);
  f.io.setupFails = false; f.io.registered = true;
  t.mock.timers.tick(60000); await tick(); assert.equal(f.io.updates, 1);
  assert.equal(f.io.registrations, failure === 'setup' ? 1 : 2);
  const count = f.io.registrations; t.mock.timers.tick(180000); await tick();
  assert.equal(f.io.registrations, count); assert.equal(f.io.resets, count); f.hooks.unmount();
});

test('v3 capability requires an installed phone channel on Android; iOS/legacy keep v2', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  for (const platform of ['android', 'ios']) for (const phone of [true, false]) {
    const f = fixture(platform); f.io.registered = true;
    if (phone) f.io.channel = 'driver-phone-ring-v3';
    f.render(); t.mock.timers.tick(1200); await tick();
    assert.deepEqual(f.io.capabilities, [platform === 'android' && phone ? 3 : 2]);
    f.hooks.unmount();
  }
});

test('only a v3 validation rejection downgrades to v2 during staged backend rollout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  for (const status of [400, 401, 500, 'FETCH_ERROR']) {
    const f = fixture(); f.io.registered = true; f.io.channel = 'driver-phone-ring-v3'; f.io.rejectV3 = status;
    f.render(); t.mock.timers.tick(1200); await tick();
    assert.deepEqual(f.io.capabilities, status === 400 ? [3, 2] : [3]);
    assert.equal(f.io.resets, f.io.registrations);
    f.hooks.unmount();
  }
});

for (const platform of ['ios', 'android']) test(`${platform}: headless task failure blocks data-only Android but not APNs sound capability`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(platform); f.io.backgroundReady = false; f.io.registered = true;
  f.render(); t.mock.timers.tick(1200); await tick();
  assert.equal(f.io.updates, 1);
  assert.equal(f.io.registrations, platform === 'ios' ? 1 : 0);
  f.hooks.unmount();
});

test('push retries pause while inactive/offline and register a changed account again', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(); f.render(); t.mock.timers.tick(1200); await tick();
  f.io.enabled = false; f.render(); t.mock.timers.tick(180000); await tick();
  assert.equal(f.io.registrations, 1); assert.equal(f.io.receive, null);
  f.io.enabled = true; f.io.registered = true; f.render(); t.mock.timers.tick(1200); await tick();
  assert.equal(f.io.registrations, 2); assert.equal(f.io.updates, 1);
  f.io.account = 'b'; f.io.version++; f.render(); t.mock.timers.tick(1200); await tick();
  assert.equal(f.io.updates, 2); assert.equal(f.io.registrations, 3); f.hooks.unmount();
});

test('native token rotation re-registers ordinary and interactive notifications', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(); f.io.registered = true; f.render(); t.mock.timers.tick(1200); await tick();
  f.io.token = 'rotated-device'; await f.io.receive(f.io.token);
  assert.equal(f.io.updates, 2); assert.equal(f.io.registrations, 2); f.hooks.unmount();
});
