const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('wake after publication is bounded, optional on old binaries, and silent on iOS or expired cards', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const io = { platform: 'android', calls: [], codes: [], stall: false, result: 'requested' };
  const bridge = { wakeDisplayedAlert: async (...args) => {
    io.calls.push(args);
    if (io.stall) await new Promise(() => {});
    return io.result;
  } };
  const wake = loader({
    'react-native': { Platform: { get OS() { return io.platform; } }, NativeModules: { ZwangaDriverAlerts: bridge } },
    './rideAudioDiagnostics': {
      ...loader()('services/rideAudioDiagnostics.ts'), reportRideAudioFailure: code => io.codes.push(code),
    },
  })('services/rideAlertScreenWake.ts').wakeDisplayedRideAlert;
  await wake('card', 'ring', 100000); await wake('card', 'ring', NaN);
  io.platform = 'ios'; await wake('card', 'ring', 200000); assert.deepEqual(io.calls, []);
  io.platform = 'android'; await wake('card', 'ring', 200000);
  assert.deepEqual(io.calls, [['card', 'ring', 200000]]); assert.deepEqual(io.codes, []);
  io.result = 'permission'; await wake('card', 'ring', 200000);
  assert.equal(io.codes.at(-1), 'RING_SCREEN_WAKE_UNAVAILABLE');
  io.result = 'not-displayed';
  const before = io.calls.length, enqueue = wake('card', 'ring', 200000);
  await tick(); assert.equal(io.calls.length, before + 1);
  t.mock.timers.tick(150); await enqueue;
  assert.equal(io.calls.length, before + 2, 'one bounded retry for the OS notification enqueue race');
  const expiring = wake('card', 'ring', Date.now() + 100); await tick();
  const beforeExpiry = io.calls.length; t.mock.timers.tick(150); await expiring;
  assert.equal(io.calls.length, beforeExpiry, 'expiry suppresses the wake retry');
  io.stall = true;
  const work = wake('card', 'ring', 200000); await tick(); t.mock.timers.tick(2000); await work;
  delete bridge.wakeDisplayedAlert; await wake('card', 'ring', 200000);
  assert.equal(io.codes.at(-1), 'RING_SCREEN_WAKE_REBUILD_REQUIRED');
});
