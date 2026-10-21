const test = require('node:test');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const jwt = account => `x.${Buffer.from(JSON.stringify({ sub: account })).toString('base64url')}.x`;

function fixture(platform = 'android') {
  const hooks = hookHarness();
  const io = { enabled: true, account: 'a', token: 'device', registered: false, setupFails: false,
    updates: 0, registrations: 0, resets: 0, version: 0, receive: null, backgroundReady: true,
    channel: 'booking-ring-v2', capabilities: [], rejectV3: null, rejectV4: null, permissionAttempts: [], tokenFails: false,
    tokenWait: null, channelWait: null, updateWait: null, backgroundWait: null, registrationWait: null,
    sent: [], aborted: 0, updateResets: 0, fallbackFails: false };
  const update = args => ({ unwrap: async () => { io.updates++; io.sent.push(args.fcmToken); if (io.updateWait) await io.updateWait; },
    abort: () => { io.aborted++; }, reset: () => { io.updateResets++; } });
  const dispatch = capability => ({ unwrap: async () => {
    io.capabilities.push(capability); io.registrations++;
    if (io.registrationWait) await io.registrationWait;
    if (capability === 3 && io.rejectV3) throw { status: io.rejectV3 };
    if (capability === 4 && io.rejectV4) throw { status: io.rejectV4 };
    return { registered: io.registered };
  }, abort: () => { io.aborted++; }, reset: () => { io.resets++; } });
  const { usePushRegistration } = loader({ react: hooks.react,
    'react-native': { Platform: { OS: platform } },
    '@/hooks/useAppIsActive': { useAppIsActive: () => io.enabled },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: value => value && io.enabled },
    '@/store/hooks': { useAppDispatch: () => dispatch },
    '@/store/api/userApi': { useUpdateFcmTokenMutation: () => [update] },
    '@/store/api/driverDispatchApi': { driverDispatchApi: { endpoints: { registerDriverNotifications: { initiate: version => version } } } },
    '@/services/pushNotifications': { obtainFcmToken: async options => {
      io.permissionAttempts.push(options?.requestPermission !== false);
      if (io.tokenWait) await io.tokenWait;
      return io.tokenFails ? null : io.token;
    }, subscribeToFcmRefresh: fn => { io.receive = fn; return () => { io.receive = null; }; } },
    '@/services/driverNotifications': { configureDriverNotifications: async () => { if (io.channelWait) await io.channelWait; if (io.setupFails) throw Error('not ready'); return io.channel; } },
    '@/services/driverAlertFallback': { configureDriverAlertFallback: async () => { if (io.fallbackFails) throw Error('synthetic channel failure'); } },
    '@/services/backgroundNotificationTask': { registerBackgroundNotificationTask: async () => { if (io.backgroundWait) await io.backgroundWait; return io.backgroundReady; } },
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

test('v4 capability works with bundled/customized native channels on Android; iOS/legacy keep v2', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  for (const platform of ['android', 'ios']) for (const channel of ['zwanga-ride-ring-v4', 'driver-phone-ring-v3', 'booking-ring-v2']) {
    const f = fixture(platform); f.io.registered = true;
    f.io.channel = channel;
    f.render(); t.mock.timers.tick(1200); await tick();
    assert.deepEqual(f.io.capabilities, [platform === 'android' && channel !== 'booking-ring-v2' ? 4 : 2]);
    f.hooks.unmount();
  }
});

test('only a validation rejection downgrades v4 to v3 then v2 during staged rollout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  for (const status of [400, 401, 500, 'FETCH_ERROR']) {
    const f = fixture(); f.io.registered = true; f.io.channel = 'driver-phone-ring-v3'; f.io.rejectV4 = status; f.io.rejectV3 = status;
    f.render(); t.mock.timers.tick(1200); await tick();
    assert.deepEqual(f.io.capabilities, status === 400 ? [4, 3, 2] : [4]);
    assert.equal(f.io.resets, f.io.registrations);
    f.hooks.unmount();
  }
});

test('v4 is never advertised before the native fallback channel is ready; setup failure retries', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(); f.io.channel = 'zwanga-ride-ring-v4'; f.io.registered = true; f.io.fallbackFails = true;
  f.render(); t.mock.timers.tick(1200); await tick();
  assert.equal(f.io.updates, 1); assert.deepEqual(f.io.capabilities, []);
  f.io.fallbackFails = false; t.mock.timers.tick(60000); await tick();
  assert.deepEqual(f.io.capabilities, [4]); assert.equal(f.io.updates, 1);
  f.hooks.unmount();
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

test('automatic setup retries permission failures without a trip to a configuration screen', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(); f.io.tokenFails = true; f.io.registered = true;
  f.render(); t.mock.timers.tick(1200); await tick();
  assert.equal(f.io.updates, 0); assert.equal(f.io.registrations, 0);
  f.io.tokenFails = false;
  t.mock.timers.tick(60000); await tick();
  assert.deepEqual(f.io.permissionAttempts, [true, true], 'permission service decides whether a prompt remains allowed');
  assert.equal(f.io.updates, 1); assert.equal(f.io.registrations, 1);
  f.hooks.unmount();
});

for (const platform of ['android', 'ios']) test(`${platform}: rotations while busy coalesce to the last token without another foreground`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(platform), gate = deferred(); f.io.registered = true; f.io.channelWait = gate.promise;
  f.render(); t.mock.timers.tick(1200); await tick();
  await f.io.receive('rotation-1'); await f.io.receive('rotation-2');
  gate.resolve(); await tick();
  assert.deepEqual(f.io.sent, ['device', 'rotation-2']);
  assert.equal(f.io.registrations, 2); assert.equal(f.io.updateResets, 2);
  t.mock.timers.tick(180000); await tick(); assert.equal(f.io.updates, 2);
  f.hooks.unmount();
});

for (const stage of ['tokenWait', 'updateWait', 'channelWait', 'backgroundWait', 'registrationWait'])
  test(`an unresolved ${stage} expires, retries and ignores its late rejection`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const f = fixture(), gate = deferred(); f.io.registered = true; f.io[stage] = gate.promise;
    f.render(); t.mock.timers.tick(1200); await tick();
    t.mock.timers.tick(30000); await tick();
    if (stage === 'updateWait' || stage === 'registrationWait') assert.equal(f.io.aborted, 1);
    f.io[stage] = null; t.mock.timers.tick(60000); await tick();
    const count = f.io.registrations; assert.ok(count >= 1);
    gate.reject(new Error('late native failure')); await tick();
    t.mock.timers.tick(60000); await tick(); assert.equal(f.io.registrations, count);
    f.hooks.unmount();
  });

test('foreground restart and account change do not wait for or accept a former native attempt', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(), gate = deferred(); f.io.tokenWait = gate.promise; f.io.registered = true;
  f.render(); t.mock.timers.tick(1200); await tick();
  f.io.enabled = false; f.render(); await tick();
  f.io.tokenWait = null; f.io.enabled = true; f.io.account = 'b'; f.io.version++; f.render();
  t.mock.timers.tick(1200); await tick(); assert.equal(f.io.updates, 1);
  gate.resolve(); await tick(); assert.equal(f.io.updates, 1);
  f.hooks.unmount();
});

test('a failed rotation retries even when the previous token was fully registered', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(), gate = deferred(); f.io.registered = true;
  f.render(); t.mock.timers.tick(1200); await tick();
  f.io.token = 'rotated'; f.io.updateWait = gate.promise;
  const rotation = f.io.receive('rotated'); gate.reject(Error('offline')); await rotation;
  f.io.updateWait = null; t.mock.timers.tick(60000); await tick();
  assert.deepEqual(f.io.sent, ['device', 'rotated', 'rotated']);
  assert.equal(f.io.registrations, 2); f.hooks.unmount();
});
