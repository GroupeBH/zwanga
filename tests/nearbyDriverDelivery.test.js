const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const fix = (latitude = 0) => ({ timestamp: Date.now(), coords: { latitude, longitude: 0, accuracy: 15 } });

function fixture() {
  let version = 0, account = 'driver', fail, wait, waitTokens, enabled = true, online = true;
  const calls = [], resets = [];
  const load = loader({
    './tokenStorage': { getTokens: async () => { if (waitTokens) await waitTokens; return { accessToken: 'test' }; } },
    './tokenSession': { getTokenSessionVersion: () => version },
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
  return { send: load('services/nearbyDriverPositionDelivery.ts').sendNearbyDriverPosition, calls, resets,
    account: value => { account = value; version++; }, fail: value => { fail = value; },
    wait: value => { wait = value; }, waitTokens: value => { waitTokens = value; },
    enabled: value => { enabled = value; }, online: () => online, cancel: () => { online = false; },
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
  t.mock.timers.tick(60000); assert.equal(await f.send('driver', fix()), 'sent');
  assert.equal(f.calls.length, 2);
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
  assert.equal(await f.send('driver', { ...fix(), timestamp: Date.now() - 60000 }), 'skipped');
  assert.equal(f.calls.length, 0);
  f.enabled(false); assert.equal(await f.send('driver', fix()), 'stop');
  for (const status of [401, 403, 404]) {
    f.fail({ status }); assert.equal(await f.send('driver', fix()), 'stop');
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
