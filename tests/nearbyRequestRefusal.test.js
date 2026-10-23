const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const driver = '00000000-0000-4000-8000-000000000001';
const order = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const state = { version: 1, owner: driver, token: 'synthetic', sends: [], resets: 0,
    read: async () => ({ accessToken: state.token }), perform: async () => ({ mutedUntil: null }) };
  const load = loader({
    './tokenSession': { getTokenSessionVersion: () => state.version },
    './tokenStorage': { getTokens: () => state.read() },
    '@/utils/jwt': { getUserIdFromToken: () => state.owner },
    '@/store': { store: { dispatch: request => {
      state.sends.push(request); return { unwrap: () => state.perform(), reset: () => { state.resets++; } };
    } } },
    '@/store/api/driverDispatchApi': { driverDispatchApi: { endpoints: {
      declineNearbyRequest: { initiate: id => ({ id }) },
    } } },
  });
  return { state, report: load('services/nearbyRequestRefusal.ts').reportNearbyRequestRefusal };
}

test('nearby refusal uses authenticated API, coalesces concurrent native actions and releases its mutation', async () => {
  const f = fixture(); let done;
  f.state.perform = () => new Promise(resolve => { done = resolve; });
  const first = f.report(driver, order), second = f.report(driver, order);
  await tick(); assert.deepEqual(f.state.sends, [{ id: order }]);
  done({}); await Promise.all([first, second]); assert.equal(f.state.resets, 1);
});

test('invalid identifiers, missing tokens and another account never report a refusal', async () => {
  const f = fixture();
  await f.report('bad', order); await f.report(driver, '../order');
  f.state.token = null; await f.report(driver, order);
  f.state.token = 'synthetic'; f.state.owner = other; await f.report(driver, order);
  assert.deepEqual(f.state.sends, []);
});

test('logout during token restoration cannot send a late refusal', async () => {
  const f = fixture(); let done;
  f.state.read = () => new Promise(resolve => { done = resolve; });
  const work = f.report(driver, order); await tick(); f.state.version++;
  done({ accessToken: 'synthetic' }); await work;
  assert.deepEqual(f.state.sends, []);
});

test('failure releases request resources, permits deliberate retry, and never queues an offline decision', async () => {
  const f = fixture(); f.state.perform = async () => { throw new Error('offline'); };
  await assert.rejects(f.report(driver, order), /offline/); assert.equal(f.state.resets, 1);
  await tick(); assert.equal(f.state.sends.length, 1);
  f.state.perform = async () => ({}); await f.report(driver, order);
  assert.equal(f.state.sends.length, 2); assert.equal(f.state.resets, 2);
});

test('nearby refusal endpoint only sends an order identifier with a bounded timeout, never a claimed driver ID', () => {
  let endpoints;
  loader({ './baseApi': { baseApi: { injectEndpoints: options => {
    endpoints = options.endpoints({ mutation: config => config, query: config => config });
    return {};
  } } } })('store/api/driverDispatchApi.ts');
  assert.deepEqual(endpoints.declineNearbyRequest.query(order), {
    url: `/driver-dispatch/nearby-requests/${order}/decline`, method: 'PUT', timeout: 10000,
  });
});
