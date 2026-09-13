const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');

const NOW = Date.parse('2026-09-12T22:00:00.000Z');
const UNACCEPTED_GRACE_MS = 30000;
const ACCEPTED_GRACE_MS = 2 * 60 * 60 * 1000;
const request = (id, expiresIn = 10000, extra = {}) => ({
  id, passengerId: 'passenger', status: 'pending',
  departureDateMax: new Date(NOW - UNACCEPTED_GRACE_MS + expiresIn).toISOString(),
  offers: [], ...extra,
});
const policy = loader()('features/trip-request/requestExpiration.ts');

function setup(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: NOW });
  let queries = 0;
  const api = createApi({
    reducerPath: 'zwangaApi',
    baseQuery: async () => { queries++; return { data: [] }; },
    keepUnusedDataFor: 3600,
    endpoints: builder => ({
      getAvailableTripRequests: builder.query({ query: () => '/requests' }),
      getMyTripRequests: builder.query({ query: () => '/mine' }),
      getTripRequestById: builder.query({ query: id => `/requests/${id}` }),
      unrelated: builder.query({ query: () => '/unrelated' }),
    }),
  });
  const load = loader({ '../api/tripRequestApi': { tripRequestApi: api } });
  const { createTripRequestExpirationMiddleware } = load('store/middleware/tripRequestExpiration.ts');
  const actions = [];
  const recorder = () => next => action => { actions.push(action); return next(action); };
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: defaults => defaults().concat(api.middleware, createTripRequestExpirationMiddleware(), recorder),
  });
  t.after(() => { store.dispatch(api.util.resetApiState()); t.mock.timers.reset(); });
  return {
    api, store, actions, load,
    queries: () => queries,
    put: (endpoint, data, arg) => store.dispatch(api.util.upsertQueryData(endpoint, arg, data)),
    read: (endpoint, arg) => api.endpoints[endpoint].select(arg)(store.getState()).data,
  };
}

test('unaccepted requests expire thirty seconds after departureDateMax, inclusively, not createdAt or Home highlight', () => {
  const item = request('pending', 0, { createdAt: new Date(NOW - 90 * ACCEPTED_GRACE_MS).toISOString() });
  assert.equal(policy.getTripRequestExpirationAt(item), NOW);
  assert.equal(policy.hasTripRequestExpired(item, NOW - 1), false);
  assert.equal(policy.hasTripRequestExpired(item, NOW), true);
  assert.equal(policy.isTripRequestWithinAcceptanceWindow(item, NOW), false);
  assert.equal(policy.getTripRequestExpirationAt(request('invalid', 0, { departureDateMax: 'invalid' })), null);
});

test('selected driver, linked trip and accepted offer give two hours from departureDateMax, not selectedAt', () => {
  for (const extra of [
    { status: 'driver_selected' }, { selectedDriverId: 'driver' },
    { tripId: 'trip' }, { offers: [{ status: 'accepted' }] },
  ]) {
    const item = request('accepted', 0, {
      departureDateMax: new Date(NOW - ACCEPTED_GRACE_MS + 1).toISOString(),
      selectedAt: new Date(NOW).toISOString(), ...extra,
    });
    assert.equal(policy.hasTripRequestExpired(item, NOW), false);
    assert.equal(policy.getTripRequestExpirationAt(item), NOW + 1);
    assert.equal(policy.hasTripRequestExpired(item, NOW + 1), true);
  }
  assert.equal(policy.hasTripRequestExpired(request('offers', 0, { status: 'offers_received' }), NOW), true);
  assert.equal(policy.isTripRequestWithinAcceptanceWindow(request('cancelled', 0, { status: 'cancelled' }), NOW), false);
  for (const status of ['pending', 'rejected', 'cancelled']) {
    assert.equal(policy.getTripRequestExpirationAt(request('offer-only', 0, {
      status: 'offers_received', offers: [{ status }],
    })), NOW);
  }
});

test('an accepted request leaves active caches at two hours without changing its trip or bookings', async t => {
  const ctx = setup(t);
  const item = request('accepted', 0, {
    status: 'driver_selected', selectedDriverId: 'driver', tripId: 'ongoing-trip',
    departureDateMax: new Date(NOW - ACCEPTED_GRACE_MS + 30000).toISOString(),
    selectedAt: new Date(NOW - 1000).toISOString(), offers: [{ status: 'accepted' }],
  });
  await ctx.put('getMyTripRequests', [item]);
  await ctx.put('getTripRequestById', item, item.id);
  await ctx.put('unrelated', { trip: { id: item.tripId, status: 'ongoing' }, booking: { status: 'accepted', paid: true } });
  const tripAndBooking = ctx.read('unrelated');
  t.mock.timers.tick(29999);
  assert.equal(ctx.read('getTripRequestById', item.id).status, 'driver_selected');
  t.mock.timers.tick(1);
  assert.equal(ctx.read('getTripRequestById', item.id).status, 'expired');
  assert.equal(ctx.read('getMyTripRequests')[0].status, 'expired');
  assert.equal(ctx.read('getMyTripRequests')[0].tripId, item.tripId);
  assert.equal(ctx.read('getMyTripRequests')[0].selectedDriverId, item.selectedDriverId);
  assert.equal(ctx.read('unrelated'), tripAndBooking);
  assert.equal(ctx.queries(), 0);
});

test('shared cache removes expired public requests at the deadline and preserves the history and detail', async t => {
  const ctx = setup(t);
  const due = request('due'), later = request('later', 70000);
  const accepted = request('accepted', 0, { selectedDriverId: 'driver' });
  await ctx.put('getAvailableTripRequests', [due, later]);
  await ctx.put('getMyTripRequests', [due, later, accepted]);
  await ctx.put('getTripRequestById', due, due.id);
  await ctx.put('getTripRequestById', later, later.id);
  await ctx.put('unrelated', { balance: 12 });
  const unrelated = ctx.read('unrelated');
  t.mock.timers.tick(9999);
  assert.equal(ctx.read('getAvailableTripRequests').length, 2);
  t.mock.timers.tick(1);
  assert.deepEqual(ctx.read('getAvailableTripRequests').map(row => row.id), ['later']);
  assert.deepEqual(ctx.read('getMyTripRequests').map(row => row.status), ['expired', 'pending', 'pending']);
  assert.equal(ctx.read('getTripRequestById', 'due').status, 'expired');
  assert.equal(ctx.read('getTripRequestById', 'later').status, 'pending');
  assert.equal(ctx.read('unrelated'), unrelated);
  assert.equal(ctx.queries(), 0);
});

test('expired cached responses are removed immediately, including offers_received and server-expired rows', async t => {
  const ctx = setup(t);
  await ctx.put('getAvailableTripRequests', [
    request('old', -1), request('offers', 0, { status: 'offers_received' }),
    request('server-expired', 60000, { status: 'expired' }), request('future'),
  ]);
  assert.deepEqual(ctx.read('getAvailableTripRequests').map(row => row.id), ['future']);
});

test('unchanged refetches do not postpone the deadline and idle checks do not rerender subscribers', async t => {
  const ctx = setup(t);
  const row = request('due', 45000);
  await ctx.put('getAvailableTripRequests', [row]);
  const original = ctx.read('getAvailableTripRequests');
  const patches = () => ctx.actions.filter(ctx.api.internalActions.queryResultPatched.match).length;
  const before = patches();
  t.mock.timers.tick(30000);
  assert.equal(ctx.read('getAvailableTripRequests'), original);
  assert.equal(patches(), before);
  await ctx.put('getAvailableTripRequests', [{ ...row }]);
  t.mock.timers.tick(14999);
  assert.equal(ctx.read('getAvailableTripRequests').length, 1);
  t.mock.timers.tick(1);
  assert.deepEqual(ctx.read('getAvailableTripRequests'), []);
  assert.equal(ctx.queries(), 0);
});

test('offline expiration needs no network and background expiration is reconciled immediately on focus', async t => {
  const ctx = setup(t);
  await ctx.put('getAvailableTripRequests', [request('offline')]);
  ctx.store.dispatch(ctx.api.endpoints.getAvailableTripRequests.initiate());
  ctx.store.dispatch(ctx.api.internalActions.onOffline());
  t.mock.timers.tick(10000);
  assert.deepEqual(ctx.read('getAvailableTripRequests'), []);
  await ctx.put('getAvailableTripRequests', [request('background', 20000)]);
  ctx.store.dispatch(ctx.api.internalActions.onFocusLost());
  const before = ctx.actions.filter(ctx.api.internalActions.queryResultPatched.match).length;
  t.mock.timers.tick(60000);
  assert.equal(ctx.actions.filter(ctx.api.internalActions.queryResultPatched.match).length, before);
  assert.equal(ctx.read('getAvailableTripRequests').length, 1);
  ctx.store.dispatch(ctx.api.internalActions.onFocus());
  assert.deepEqual(ctx.read('getAvailableTripRequests'), []);
  assert.equal(ctx.queries(), 0);
});

test('server acceptance and deadline edits cancel the old local expiration', async t => {
  const ctx = setup(t);
  await ctx.put('getTripRequestById', request('accepted'), 'accepted');
  await ctx.put('getTripRequestById', request('edited'), 'edited');
  t.mock.timers.tick(9000);
  await ctx.put('getTripRequestById', request('accepted', 10000, { status: 'driver_selected', tripId: 'trip' }), 'accepted');
  ctx.store.dispatch(ctx.api.util.updateQueryData('getTripRequestById', 'edited', draft => {
    draft.departureDateMax = request('edited', 60000).departureDateMax;
  }));
  t.mock.timers.tick(1000);
  assert.equal(ctx.read('getTripRequestById', 'accepted').status, 'driver_selected');
  assert.equal(ctx.read('getTripRequestById', 'edited').status, 'pending');
  t.mock.timers.tick(50000);
  assert.equal(ctx.read('getTripRequestById', 'accepted').status, 'driver_selected');
  assert.equal(ctx.read('getTripRequestById', 'edited').status, 'expired');
});

test('resetting the API at logout cancels timers without reviving another account cache', async t => {
  const ctx = setup(t);
  await ctx.put('getAvailableTripRequests', [request('old-account')]);
  ctx.store.dispatch(ctx.api.util.resetApiState());
  await ctx.put('getAvailableTripRequests', [request('new-account', 60000)]);
  t.mock.timers.tick(10000);
  assert.deepEqual(ctx.read('getAvailableTripRequests').map(row => row.id), ['new-account']);
  t.mock.timers.tick(50000);
  assert.deepEqual(ctx.read('getAvailableTripRequests'), []);
});

test('a forward clock change is reconciled within thirty seconds without new HTTP queries', async t => {
  const ctx = setup(t);
  await ctx.put('getAvailableTripRequests', [request('clock', 600000)]);
  t.mock.timers.setTime(NOW + 700000);
  t.mock.timers.tick(30000);
  assert.deepEqual(ctx.read('getAvailableTripRequests'), []);
  assert.equal(ctx.queries(), 0);
});
