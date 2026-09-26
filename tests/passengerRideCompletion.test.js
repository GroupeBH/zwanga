const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');

const trip = { id: 'trip', driverId: 'owner', status: 'ongoing' };
const booking = { id: 'mine', tripId: 'trip', passengerId: 'rider', status: 'accepted',
  trip, numberOfSeats: 3, paymentMode: 'electronic', paymentStatus: 'pending', totalPrice: 6000 };

function setup(t) {
  let requests = 0, nextResponse = { data: booking };
  const api = createApi({ reducerPath: 'cache', baseQuery: async () => { requests++; return nextResponse; },
    endpoints: b => ({
      getMyActivityBookings: b.query({ query: () => 'activity' }),
      getMyBookings: b.query({ query: () => 'mine' }),
      getBookingById: b.query({ query: id => id }),
      confirmDropoffByPassenger: b.mutation({ query: id => id }),
      confirmPassengerTripInterruption: b.mutation({ query: id => id }),
      confirmDropoff: b.mutation({ query: id => id }),
    }),
  });
  const { createPassengerRideCompletionMiddleware } = loader({ '../api/bookingApi': { bookingApi: api } })(
    'store/middleware/passengerRideCompletion.ts');
  const store = configureStore({ reducer: { cache: api.reducer,
    auth: (state = { user: { id: 'rider' } }, action) => action.type === 'switch'
      ? { user: { id: action.payload } } : state,
  }, middleware: defaults => defaults().concat(api.middleware, createPassengerRideCompletionMiddleware()) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  return { store, api, requests: () => requests, respond: response => { nextResponse = response; },
    put: (name, data, id) => store.dispatch(api.util.upsertQueryData(name, id, data)),
    read: (name, id) => api.endpoints[name].select(id)(store.getState()).data };
}

test('detail dropoff immediately updates Home and banner lists without marking payments paid or ending the trip', async t => {
  const e = setup(t);
  const nextRide = { ...booking, id: 'next', tripId: 'next-trip' };
  await e.put('getMyActivityBookings', [booking, nextRide]);
  await e.put('getMyBookings', [booking]);
  const finished = { ...booking, status: 'completed', droppedOff: true };
  await e.put('getBookingById', finished, 'mine');
  for (const name of ['getMyActivityBookings', 'getMyBookings']) {
    const row = e.read(name)[0];
    assert.equal(row.status, 'completed'); assert.equal(row.droppedOff, true);
    assert.equal(row.paymentStatus, 'pending'); assert.equal(row.totalPrice, 6000);
    assert.equal(row.numberOfSeats, 3); assert.equal(row.trip.status, 'ongoing');
  }
  assert.deepEqual(e.read('getMyActivityBookings')[1], nextRide);
  assert.equal(e.requests(), 0, 'synchronization adds no request');
});

for (const name of ['confirmDropoffByPassenger', 'confirmDropoff', 'confirmPassengerTripInterruption']) {
  test(`${name}: acknowledged completion propagates, failed confirmations do not`, async t => {
    const e = setup(t);
    await e.put('getMyActivityBookings', [booking]);
    e.respond({ error: { status: 503, data: 'unavailable' } });
    await e.store.dispatch(e.api.endpoints[name].initiate('mine'));
    assert.equal(e.read('getMyActivityBookings')[0].status, 'accepted');
    e.respond({ data: { ...booking, droppedOffAt: '2026-09-25T12:00:00Z' } });
    await e.store.dispatch(e.api.endpoints[name].initiate('mine'));
    assert.equal(e.read('getMyActivityBookings')[0].droppedOffAt, '2026-09-25T12:00:00Z');
    assert.equal(e.read('getMyActivityBookings')[0].paymentStatus, 'pending');
  });
}

test('late stale detail and list responses cannot restore a passenger already dropped off', async t => {
  const e = setup(t);
  await e.put('getMyActivityBookings', [booking]);
  await e.put('getBookingById', { ...booking, droppedOffConfirmedByPassenger: true }, 'mine');
  await e.put('getMyActivityBookings', [{ ...booking, paymentStatus: 'succeeded' }]);
  await e.put('getBookingById', { ...booking, paymentStatus: 'succeeded' }, 'mine');
  assert.equal(e.read('getMyActivityBookings')[0].droppedOffConfirmedByPassenger, true);
  assert.equal(e.read('getBookingById', 'mine').droppedOffConfirmedByPassenger, true);
  assert.equal(e.read('getBookingById', 'mine').paymentStatus, 'succeeded', 'new financial data is not overwritten');
  const rows = e.read('getMyActivityBookings');
  await e.put('getBookingById', { ...booking, droppedOffConfirmedByPassenger: true }, 'mine');
  assert.equal(e.read('getMyActivityBookings'), rows, 'duplicate events keep unchanged list references');
});

test('cached completed detail reconciles an activity list first loaded later', async t => {
  const e = setup(t);
  await e.put('getBookingById', { ...booking, status: 'completed' }, 'mine');
  await e.put('getMyActivityBookings', [booking]);
  assert.equal(e.read('getMyActivityBookings')[0].status, 'completed');
});

test('foreign passenger, wrong trip and changed account cannot complete the current passenger ride', async t => {
  const e = setup(t);
  await e.put('getMyActivityBookings', [booking]);
  await e.put('getBookingById', { ...booking, passengerId: 'other', status: 'completed' }, 'mine');
  assert.equal(e.read('getMyActivityBookings')[0].status, 'accepted');
  await e.put('getBookingById', { ...booking, tripId: 'wrong-trip', status: 'completed' }, 'mine');
  assert.equal(e.read('getMyActivityBookings')[0].status, 'accepted');
  e.store.dispatch({ type: 'switch', payload: 'other' });
  await e.put('getBookingById', { ...booking, status: 'completed' }, 'mine');
  assert.equal(e.read('getMyActivityBookings')[0].status, 'accepted');
});

test('completion does not override cancelled reservations or create absent activity entries', async t => {
  const e = setup(t);
  await e.put('getMyActivityBookings', [{ ...booking, status: 'cancelled' }]);
  await e.put('getBookingById', { ...booking, status: 'completed' }, 'mine');
  assert.equal(e.read('getMyActivityBookings')[0].status, 'cancelled');
  assert.equal(e.read('getMyBookings'), undefined);
  await e.put('getMyActivityBookings', []);
  assert.deepEqual(e.read('getMyActivityBookings'), []);
});
