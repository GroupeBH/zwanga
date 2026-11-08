const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
function fixture() {
  const io = { calls: [], aborts: 0, resets: 0, network: async () => ({ allowed: true }) };
  const check = loader({
    '@/store': { store: { dispatch: args => { io.calls.push(args); return {
      unwrap: () => io.network(), abort: () => io.aborts++, reset: () => io.resets++,
    }; } } },
    '@/store/api/rideRingApi': { rideRingApi: { endpoints: { validateRideRing: { initiate: (token, options) => ({ token, options }) } } } },
  })('services/rideRingValidation.ts');
  return { io, ...check };
}
const data = () => ({ type: 'driver_dispatch_offer', tripRequestId: 'request',
  ringValidationToken: 'test-invitation-capability', ringUntil: new Date(Date.now() + 40000).toISOString() });

test('a queued request is silent after cancellation, another acceptance, malformed reply or API failure', async () => {
  const f = fixture();
  for (const reply of [{ allowed: false }, undefined, { allowed: 'true' }]) {
    f.io.network = async () => reply; assert.equal(await f.validateRideRing(data()), false);
  }
  f.io.network = async () => { throw Error('network unavailable'); };
  assert.equal(await f.validateRideRing(data()), false);
});

test('revalidation distinguishes terminal denial, expiry and recoverable transport failures', async () => {
  const f = fixture();
  assert.equal(await f.checkRideRing(data()), 'allowed');
  f.io.network = async () => ({ allowed: false });
  assert.equal(await f.checkRideRing(data()), 'denied');
  f.io.network = async () => { throw Error('offline'); };
  assert.equal(await f.checkRideRing(data()), 'unavailable');
  assert.equal(await f.checkRideRing({ ...data(), ringValidationToken: undefined }), 'unavailable');
  assert.equal(await f.checkRideRing({ ...data(), ringUntil: new Date(0).toISOString() }), 'expired');
});
test('simultaneous deliveries share work, but approval is not cached and mutations are not retained', async () => {
  const f = fixture(), event = data();
  assert.deepEqual(await Promise.all([f.validateRideRing(event), f.validateRideRing(event)]), [true, true]);
  assert.deepEqual(f.io.calls, [{ token: event.ringValidationToken, options: { track: false } }]);
  assert.equal(f.io.resets, 1); assert.equal(f.rideRingValidationIsCurrent(event), true);
  await f.validateRideRing(event); assert.equal(f.io.calls.length, 2);
});
test('missing token/deadline and expired messages fail closed without network; bookings are unchanged', async () => {
  const f = fixture();
  for (const change of [{ ringValidationToken: undefined }, { ringUntil: undefined }, { ringUntil: new Date(0).toISOString() }])
    assert.equal(await f.validateRideRing({ ...data(), ...change }), false);
  assert.equal(await f.validateRideRing({ type: 'new_booking' }), true); assert.equal(f.io.calls.length, 0);
});
test('terminal event before hydration invalidates in-flight allowance, but not a new generation', async () => {
  const f = fixture(), event = data(); let finish;
  f.io.network = () => new Promise(resolve => { finish = resolve; });
  const pending = f.validateRideRing(event); await new Promise(resolve => setImmediate(resolve));
  f.invalidateRideRingValidation('request'); finish({ allowed: true });
  assert.equal(await pending, false); assert.equal(f.rideRingValidationIsCurrent(event), false);
  f.io.network = async () => ({ allowed: true });
  assert.equal(await f.validateRideRing({ ...event, ringValidationToken: 'new-generation' }), true);
});
test('a stalled request is aborted and bounded even if the transport ignores abort', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  const f = fixture(); f.io.network = () => new Promise(() => {});
  const pending = f.validateRideRing(data());
  await new Promise(resolve => setImmediate(resolve)); t.mock.timers.tick(3001);
  assert.equal(await pending, false); assert.equal(f.io.aborts, 1); assert.equal(f.io.resets, 1);
});
test('short publication leases expire and terminal realtime invalidates them', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const f = fixture(), event = data();
  await f.validateRideRing(event); t.mock.timers.tick(3001);
  assert.equal(f.rideRingValidationIsCurrent(event), false);
  await f.validateRideRing(event); f.invalidateRideRingValidation('request');
  assert.equal(f.rideRingValidationIsCurrent(event), false);
});
test('endpoint reuses public RTK transport with POST, bounded timeout, no credentials or redirects', async () => {
  const calls = [];
  const api = loader({ './baseApi': { baseApi: { injectEndpoints: definition => definition.endpoints({ mutation: value => value }) },
    publicBaseQuery: async (...args) => { calls.push(args); return { data: { allowed: true } }; },
  } })('store/api/rideRingApi.ts').rideRingApi;
  assert.deepEqual(await api.validateRideRing.queryFn('capability', {}, {}), { data: { allowed: true } });
  assert.deepEqual(calls[0][0], { url: '/notifications/ride-alerts/validate', method: 'POST',
    body: { token: 'capability' }, timeout: 3000, redirect: 'error' });
});

test('slow publication renews only an expired lease, never its deadline or a terminal invalidation', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const f = fixture(), event = data(), original = event.ringUntil;
  assert.equal(await f.refreshRideRingValidation(event), 'denied', 'no lease to renew');
  await f.checkRideRing(event);
  assert.equal(await f.refreshRideRingValidation(event), 'allowed');
  assert.equal(f.io.calls.length, 1, 'fast path adds no network operation');
  t.mock.timers.tick(3500);
  assert.equal(await f.refreshRideRingValidation(event), 'allowed');
  assert.equal(f.io.calls.length, 2);
  assert.equal(event.ringUntil, original);
  f.invalidateRideRingValidation('request');
  assert.equal(await f.refreshRideRingValidation(event), 'denied');
  assert.equal(f.io.calls.length, 2, 'do not renew a terminal generation');
});

test('renewal observes a server refusal and expiry without extending the sound', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  for (const end of ['denied', 'expired']) {
    const f = fixture(), event = data(); await f.checkRideRing(event);
    t.mock.timers.tick(end === 'expired' ? 40001 : 3001);
    f.io.network = async () => ({ allowed: false });
    assert.equal(await f.refreshRideRingValidation(event), end);
    assert.equal(f.rideRingValidationIsCurrent(event), false);
  }
});
