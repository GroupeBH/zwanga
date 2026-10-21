const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const fix = (latitude = 0) => ({ timestamp: Date.now(), coords: { latitude, longitude: 0, accuracy: 15 } });

function fixture() {
  let version = 0, account = 'driver', fail, wait, waitTokens, enabled = true, online = true;
  let driverRide = null, passengerRide = null;
  const calls = [], resets = [];
  const load = loader({
    './tokenStorage': { getTokens: async () => { if (waitTokens) await waitTokens; return { accessToken: 'test' }; } },
    './tokenSession': { getTokenSessionVersion: () => version },
    './driverBackgroundLocationSession': { getActiveDriverBackgroundTripSession: async () => driverRide },
    './background/passengerTaskLifecycle': { getActiveTrackingSession: async () => passengerRide },
    '@/utils/jwt': { decodeJWT: () => ({ sub: account }) },
    '@/store': { store: { dispatch: body => {
      calls.push(body);
      return { unwrap: async () => { if (wait) await wait; if (fail) throw fail; return { enabled, automatic: true }; },
        reset: () => resets.push(true) };
    } } },
    '@/store/api/driverDispatchApi': { driverDispatchApi: { endpoints: {
      recordDriverPosition: { initiate: body => body },
    } } },
  });
  const delivery = load('services/nearbyDriverPositionDelivery.ts');
  return { send: delivery.sendNearbyDriverPosition, needsFix: delivery.needsNearbyDriverPosition,
    health: load('services/nearbyDriverLocationHealth.ts').getNearbyDriverLocationHealth, calls, resets,
    account: value => { account = value; version++; }, fail: value => { fail = value; },
    wait: value => { wait = value; }, waitTokens: value => { waitTokens = value; },
    enabled: value => { enabled = value; }, online: () => online, cancel: () => { online = false; },
    driverRide: value => { driverRide = value; }, passengerRide: value => { passengerRide = value; },
  };
}

test('foreground/background delivery is single flight and resets RTK mutation entries', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const f = fixture(); let resolve; f.wait(new Promise(done => { resolve = done; }));
  const first = f.send('driver', fix()); await tick();
  assert.equal(await f.send('driver', fix()), 'skipped');
  resolve(); assert.equal(await first, 'sent');
  assert.equal(f.calls.length, 1); assert.equal(f.resets.length, 1);
  assert.deepEqual(Object.keys(f.calls[0]).sort(), ['latitude', 'longitude', 'accuracy', 'recordedAt'].sort());
  t.mock.timers.tick(60000); assert.equal(await f.send('driver', fix()), 'skipped');
  t.mock.timers.tick(60000); assert.equal(await f.send('driver', fix()), 'skipped');
  t.mock.timers.tick(60000); assert.equal(await f.send('driver', fix()), 'sent');
  assert.equal(f.calls.length, 2);
});

test('foreground recovery observes successful delivery, backoff and session isolation', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const f = fixture();
  assert.equal(f.needsFix('driver'), true);
  await f.send('driver', fix());
  assert.equal(f.needsFix('driver'), false);
  assert.equal(f.health('driver').lastSentAt, Date.now());
  t.mock.timers.tick(179999); assert.equal(f.needsFix('driver'), false);
  t.mock.timers.tick(1); assert.equal(f.needsFix('driver'), true);
  f.fail({ status: 'FETCH_ERROR' }); await f.send('driver', fix());
  assert.equal(f.needsFix('driver'), false, 'no one-shot GPS storm during network backoff');
  t.mock.timers.tick(30000); assert.equal(f.needsFix('driver'), true);
  f.account('other'); assert.equal(f.health('other').lastSentAt, null);
  assert.equal(f.needsFix('other'), true);
});

test('HTTP acknowledgement latency does not postpone the foreground watchdog for another three minutes', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const f = fixture(); let release; f.wait(new Promise(resolve => { release = resolve; }));
  const sending = f.send('driver', fix()); await tick();
  assert.equal(f.needsFix('driver'), false, 'no duplicate while the request is pending');
  t.mock.timers.tick(10000); release(); await sending;
  t.mock.timers.tick(170000); assert.equal(f.needsFix('driver'), true);
});

test('network errors back off exponentially with no queued coordinates or replay', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const f = fixture(); f.fail({ status: 'FETCH_ERROR' });
  assert.equal(await f.send('driver', fix()), 'skipped');
  t.mock.timers.tick(29999); await f.send('driver', fix()); assert.equal(f.calls.length, 1);
  t.mock.timers.tick(1); await f.send('driver', fix()); assert.equal(f.calls.length, 2);
  t.mock.timers.tick(59999); await f.send('driver', fix()); assert.equal(f.calls.length, 2);
  f.fail(null); t.mock.timers.tick(1); assert.equal(await f.send('driver', fix(0.01)), 'sent');
  assert.equal(f.calls.length, 3); assert.equal(f.calls[2].latitude, 0.01); assert.equal(f.resets.length, 3);
});

test('invalid fixes are never submitted and unsupported/server-disabled accounts stop native collection', async () => {
  const f = fixture();
  assert.equal(await f.send('driver', { ...fix(), coords: { ...fix().coords, accuracy: 300 } }), 'skipped');
  assert.equal(f.calls.length, 0);
  f.enabled(false); assert.equal(await f.send('driver', fix()), 'stop');
  for (const status of [401, 403, 404]) {
    f.fail({ status }); assert.equal(await f.send('driver', fix()), 'stop');
  }
});

test('old fixes are sent with their real timestamp, without duplicate or out-of-order replay', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(), old = { ...fix(), timestamp: Date.now() - 90 * 86400000 };
  assert.equal(await f.send('driver', old), 'sent');
  assert.equal(f.calls[0].recordedAt, new Date(old.timestamp).toISOString());
  t.mock.timers.tick(180000);
  assert.equal(await f.send('driver', old), 'skipped');
  assert.equal(await f.send('driver', { ...old, timestamp: old.timestamp - 1 }), 'skipped');
  assert.equal(await f.send('driver', { ...old, timestamp: old.timestamp + 1 }), 'sent');
  assert.equal(f.calls.length, 2);
});

test('a failed old fix can be retried on a later callback without changing its timestamp', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(), old = { ...fix(), timestamp: Date.now() - 86400000 };
  f.fail({ status: 'FETCH_ERROR' });
  assert.equal(await f.send('driver', old), 'skipped');
  f.fail(null); t.mock.timers.tick(30000);
  assert.equal(f.calls.length, 1, 'no automatic history replay');
  assert.equal(await f.send('driver', old), 'sent');
  assert.equal(f.calls[0].recordedAt, f.calls[1].recordedAt);
});

test('discovery does not upload fresh or old positions during a driver or passenger ride', async () => {
  for (const kind of ['driverRide', 'passengerRide']) {
    const f = fixture(); f[kind]({ id: 'ride' });
    assert.equal(await f.send('driver', fix()), 'skipped');
    assert.equal(await f.send('driver', { ...fix(), timestamp: Date.now() - 86400000 }), 'skipped');
    assert.equal(f.calls.length, 0);
    f[kind](null);
    assert.equal(await f.send('driver', fix()), 'sent');
  }
});

test('a ride starting while credentials load blocks delayed discovery delivery', async () => {
  for (const kind of ['driverRide', 'passengerRide']) {
    const f = fixture(); let resolve;
    f.waitTokens(new Promise(done => { resolve = done; }));
    const sending = f.send('driver', { ...fix(), timestamp: Date.now() - 60000 });
    await tick(); f[kind]({ id: 'ride' }); resolve();
    assert.equal(await sending, 'skipped'); assert.equal(f.calls.length, 0);
  }
});

test('wrong account, logout during credentials read and a cancelled foreground fix cannot send', async () => {
  const f = fixture(); f.account('someone-else');
  assert.equal(await f.send('driver', fix()), 'stop'); assert.equal(f.calls.length, 0);
  let resolve; f.account('driver'); f.waitTokens(new Promise(done => { resolve = done; }));
  const sending = f.send('driver', fix()); await tick(); f.account('next-account'); resolve();
  assert.equal(await sending, 'skipped'); assert.equal(f.calls.length, 0);
  f.cancel(); assert.equal(await f.send('next-account', fix(), f.online), 'skipped');
});

test('an old account response cannot throttle a new account after login', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const f = fixture(); let resolve; f.wait(new Promise(done => { resolve = done; }));
  const sending = f.send('driver', fix()); await tick(); f.account('next-driver'); resolve();
  assert.equal(await sending, 'skipped');
  assert.equal(await f.send('next-driver', fix()), 'sent'); assert.equal(f.calls.length, 2);
});
