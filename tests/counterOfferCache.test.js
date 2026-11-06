const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('@reduxjs/toolkit/query');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const initial = { id: 'request', passengerId: 'passenger', status: 'pending', offers: [] };
const offer = { id: 'offer', tripRequestId: 'request', driverId: 'driver', status: 'pending', pricePerSeat: 1500 };

async function fixture(t, user = 'driver', realMapper = false) {
  let reply;
  const state = { user, version: 1 };
  const api = createApi({ reducerPath: 'api', baseQuery: () => new Promise(resolve => { reply = resolve; }),
    tagTypes: ['TripRequest', 'MyDriverOffers', 'MyTripRequests', 'AccountActivity', 'Notification'],
    endpoints: b => ({ getTripRequestById: b.query({ query: id => id }) }) });
  const load = loader({ './baseApi': { baseApi: api }, './tripRequestApi': { tripRequestApi: api },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
    ...(realMapper ? {} : { './trip-request/requestMapper': { mapServerTripRequestToClient: x => x, mapServerDriverOfferToClient: x => x } }) });
  const { counterOfferApi } = load('store/api/counterOfferApi.ts');
  const store = configureStore({ reducer: { api: api.reducer, auth: () => ({ user: { id: state.user } }) },
    middleware: defaults => defaults().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  const seed = data => store.dispatch(api.util.upsertQueryData('getTripRequestById', 'request', data));
  await seed(initial);
  const send = reject => store.dispatch(counterOfferApi.endpoints[reject ? 'declineCounterOffer' : 'proposeCounterOffer'].initiate(
    reject ? { requestId: 'request', offerId: 'offer' } : { requestId: 'request', vehicleId: 'vehicle', pricePerSeat: 1500 }));
  return { state, send, seed, reply: result => reply(result), read: () => api.endpoints.getTripRequestById.select('request')(store.getState()).data };
}

test('confirmed proposed price immediately exposes withdrawal without waiting for a refetch', async t => {
  const f = await fixture(t), work = f.send();
  assert.deepEqual(f.read(), initial, 'do not claim a price was sent before confirmation');
  f.reply({ data: offer }); await work.unwrap(); await tick();
  assert.equal(f.read().status, 'offers_received'); assert.deepEqual(f.read().offers, [offer]);
  const repeat = f.send(); f.reply({ data: offer }); await repeat.unwrap(); await tick();
  assert.equal(f.read().offers.length, 1, 'idempotent response cannot duplicate the price');
});

test('actual sanitized backend response without a parent ID is mapped to the requested order', async t => {
  const f = await fixture(t, 'driver', true), work = f.send();
  f.reply({ data: { id: 'offer', driver: { id: 'driver', firstName: 'Conducteur', lastName: 'Test' },
    vehicle: null, status: 'pending', pricePerSeat: '1500', availableSeats: 2, createdAt: '2026-11-06T10:00:00Z' } });
  await work.unwrap(); await tick();
  assert.equal(f.read().status, 'offers_received');
  assert.equal(f.read().offers[0].tripRequestId, 'request');
  assert.equal(f.read().offers[0].pricePerSeat, 1500);
});

test('passenger rejection replaces the pending offer only after confirmation', async t => {
  const f = await fixture(t, 'passenger'); await f.seed({ ...initial, status: 'offers_received', offers: [offer] });
  const work = f.send(true), result = { ...initial, offers: [{ ...offer, status: 'rejected' }] };
  assert.equal(f.read().offers[0].status, 'pending');
  f.reply({ data: result }); await work.unwrap(); await tick();
  assert.deepEqual(f.read(), result);
});

for (const reject of [false, true]) test(`failed or old-session response cannot rewrite request cache (reject=${reject})`, async t => {
  const f = await fixture(t, reject ? 'passenger' : 'driver'); const before = f.read();
  let work = f.send(reject); f.reply({ error: { status: 'FETCH_ERROR', error: 'offline' } });
  await assert.rejects(work.unwrap()); await tick(); assert.deepEqual(f.read(), before);
  work = f.send(reject); f.state.version++;
  f.reply({ data: reject ? { ...initial, status: 'offers_received' } : offer }); await work.unwrap(); await tick();
  assert.deepEqual(f.read(), before);
});

test('a late proposal response cannot replace an assignment already observed', async t => {
  const f = await fixture(t), work = f.send();
  const assigned = { ...initial, status: 'driver_selected', selectedDriverId: 'driver', tripId: 'trip' };
  await f.seed(assigned); f.reply({ data: offer }); await work.unwrap(); await tick();
  assert.deepEqual(f.read(), assigned);
});

test('a late rejection response cannot reopen a subsequently assigned request', async t => {
  const f = await fixture(t, 'passenger'), work = f.send(true);
  const assigned = { ...initial, status: 'driver_selected', selectedDriverId: 'other', tripId: 'trip' };
  await f.seed(assigned); f.reply({ data: { ...initial, offers: [{ ...offer, status: 'rejected' }] } });
  await work.unwrap(); await tick(); assert.deepEqual(f.read(), assigned);
});
