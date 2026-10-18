const test = require('node:test');
const assert = require('node:assert/strict');
const { produce } = require('immer');
const { loader } = require('./helpers/loadTypeScript.cjs');
const trip = { id: 'trip', driverId: 'driver', status: 'ongoing' };
const source = { id: 'a', tripId: 'trip', passengerId: 'holder', numberOfSeats: 3, trip,
  status: 'accepted', paymentMode: 'electronic', paymentAmount: 6000, paymentStatus: 'pending',
  updatedAt: '2026-09-23T10:00:00Z', interruptionRequest: { id: 'request', status: 'pending' } };
const completed = { ...source, updatedAt: '2026-09-23T10:01:00Z', status: 'completed',
  interruptionRequest: null, droppedOff: true, interruptionFareLocked: true, paymentAmount: 1500 };

function fixture() {
  const cache = { getTripBookings: [source, { ...source, id: 'other', passengerId: 'other-holder' }],
    getBookingById: source, getTripById: trip };
  const actions = []; let user = { id: 'driver' };
  const api = { util: { updateQueryData: (endpoint, arg, recipe) => ({ endpoint, arg, recipe }) },
    endpoints: { getTripById: { select: id => () => ({ data: cache.getTripById?.id === id ? cache.getTripById : undefined }) } } };
  const { applyPassengerInterruptionResponse } = loader({
    '../bookingApi': { bookingApi: api }, '../tripApi': { tripApi: api },
  })('store/api/booking/passengerInterruptionResponseCache.ts');
  const dispatch = action => { actions.push(action); cache[action.endpoint] = produce(cache[action.endpoint], action.recipe); };
  return { cache, actions, setUser: value => { user = value; }, apply: (value = completed) =>
    applyPassengerInterruptionResponse(value, source, 'driver')(dispatch, () => ({ auth: { user } })) };
}

test('a confirmed response updates both driver caches with the exact group fare, not other bookings or the whole trip', () => {
  const h = fixture(); const other = h.cache.getTripBookings[1]; h.apply();
  assert.equal(h.cache.getTripBookings[0].status, 'completed');
  assert.equal(h.cache.getTripBookings[0].interruptionRequest, null);
  assert.equal(h.cache.getTripBookings[0].paymentAmount, 1500);
  assert.equal(h.cache.getTripBookings[0].numberOfSeats, 3);
  assert.equal(h.cache.getBookingById.paymentMode, 'electronic');
  assert.equal(h.cache.getBookingById.paymentStatus, 'pending', 'dropoff never claims electronic payment succeeded');
  assert.equal(h.cache.getTripBookings[1], other); assert.equal(h.cache.getTripById, trip);
  assert.deepEqual(h.actions.map(({ endpoint, arg }) => [endpoint, arg]), [['getTripBookings', 'trip'], ['getBookingById', 'a']]);
  const { getConfirmedDropoffs } = loader()('features/driver-navigation/driverDropoffReceiptsModel.ts');
  assert.deepEqual(getConfirmedDropoffs(h.cache.getTripBookings, 'trip').map(item => item.id), ['a']);
});

test('refusal clears only the selected request without ending or repricing the reservation', () => {
  const h = fixture(); h.apply({ ...source, interruptionRequest: null });
  assert.equal(h.cache.getTripBookings[0].status, 'accepted');
  assert.equal(h.cache.getTripBookings[0].paymentAmount, 6000);
  assert.equal(h.cache.getTripBookings[0].interruptionRequest, null);
  assert.equal(h.cache.getTripBookings[1].interruptionRequest.id, 'request');
});

test('wrong account, driver, booking, trip, holder or request cannot update the cache', () => {
  const h = fixture(); h.setUser(null); h.apply(); h.setUser({ id: 'other' }); h.apply();
  h.setUser({ id: 'driver' });
  for (const patch of [{ id: 'b' }, { tripId: 'elsewhere' }, { passengerId: 'elsewhere' },
    { interruptionRequest: { ...source.interruptionRequest, id: 'new', status: 'completed' } }]) h.apply({ ...completed, ...patch });
  h.cache.getTripById = { ...trip, driverId: 'someone-else' }; h.apply();
  assert.equal(h.actions.length, 0);
});

test('late response cannot restore an old request, regress a completed booking, or overwrite a newer payment', () => {
  for (const current of [{ ...source, interruptionRequest: { id: 'new', status: 'pending' } },
    { ...completed, paymentStatus: 'succeeded', updatedAt: '2026-09-23T10:02:00Z' },
    { ...source, status: 'cancelled' }]) {
    const h = fixture(); h.cache.getTripBookings = [current]; h.cache.getBookingById = current; h.apply();
    assert.equal(h.cache.getTripBookings[0], current); assert.equal(h.cache.getBookingById, current);
  }
  const h = fixture(); h.cache.getBookingById = completed;
  h.apply({ ...source, interruptionRequest: null }); assert.equal(h.cache.getBookingById, completed);
});
