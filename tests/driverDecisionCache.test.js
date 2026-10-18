const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');

async function fixture(t) {
  const api = createApi({ reducerPath: 'cache', baseQuery: async () => ({ data: null }), endpoints: b => ({
    getTripBookings: b.query({ query: id => id }), getBookingById: b.query({ query: id => id }),
    getTripById: b.query({ query: id => id }),
  }) });
  const store = configureStore({ reducer: { cache: api.reducer, auth: (state = { user: { id: 'driver' } }, action) =>
    action.type === 'switch' ? { user: { id: 'other' } } : state }, middleware: d => d().concat(api.middleware) });
  const source = { id: 'a', tripId: 'trip', passengerId: 'passenger', numberOfSeats: 3, status: 'pending',
    totalPrice: 6000, updatedAt: '2026-09-23T10:00:00Z' };
  const other = { ...source, id: 'b', passengerId: 'another', numberOfSeats: 1 };
  await store.dispatch(api.util.upsertQueryData('getTripById', 'trip', { id: 'trip', driverId: 'driver' }));
  await store.dispatch(api.util.upsertQueryData('getTripBookings', 'trip', [source, other]));
  await store.dispatch(api.util.upsertQueryData('getBookingById', 'a', source));
  const { applyDriverBookingDecision } = loader({ '../bookingApi': { bookingApi: api }, '../tripApi': { tripApi: api } })(
    'store/api/booking/driverDecisionCache.ts');
  t.after(() => store.dispatch(api.util.resetApiState()));
  return { api, store, source, other, apply: (status, response) => store.dispatch(applyDriverBookingDecision(source, status, 'driver', response)),
    read: (name, id) => api.endpoints[name].select(id)(store.getState()).data };
}

test('confirmed decision updates both caches for one booking, preserving the group and money', async t => {
  const e = await fixture(t); e.apply('accepted', { ...e.source, status: 'accepted' });
  const rows = e.read('getTripBookings', 'trip');
  assert.equal(rows[0].status, 'accepted'); assert.equal(rows[0].numberOfSeats, 3);
  assert.equal(rows[0].totalPrice, 6000); assert.deepEqual(rows[1], e.other);
  assert.equal(e.read('getBookingById', 'a').status, 'accepted');
});

test('foreign response and changed account cannot modify booking caches', async t => {
  const e = await fixture(t); e.apply('accepted', { ...e.other, status: 'accepted' });
  assert.equal(e.read('getBookingById', 'a').status, 'pending');
  e.store.dispatch({ type: 'switch' }); e.apply('cancelled');
  assert.equal(e.read('getBookingById', 'a').status, 'pending');
});

test('an older acceptance cannot reverse a later cancellation', async t => {
  const e = await fixture(t);
  e.store.dispatch(e.api.util.updateQueryData('getBookingById', 'a', value => { value.status = 'cancelled'; }));
  e.apply('accepted', { ...e.source, status: 'accepted' });
  assert.equal(e.read('getBookingById', 'a').status, 'cancelled');
});
