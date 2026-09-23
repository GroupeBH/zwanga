const test = require('node:test');
const assert = require('node:assert/strict');
const { produce } = require('immer');
const { loader } = require('./helpers/loadTypeScript.cjs');
const scope = { tripId: 'trip', bookingId: 'booking', passengerId: 'holder', requestId: 'request' };
const request = { id: 'request', tripId: 'trip', status: 'pending',
  confirmations: [{ bookingId: 'booking', passengerId: 'holder', status: 'pending' }] };
const trip = { id: 'trip', status: 'ongoing', interruptionRequest: request };
const booking = { id: 'booking', tripId: 'trip', passengerId: 'holder', trip, tripInterruptionRequest: request,
  status: 'accepted', numberOfSeats: 3, pickedUp: true, droppedOff: false, paymentAmount: 6000, paymentMode: 'cash' };
const paused = { ...trip, status: 'upcoming', interruptionRequest: { ...request, status: 'confirmed',
  confirmations: [{ ...request.confirmations[0], status: 'confirmed' }] } };
function harness() {
  const cache = { getTripById: trip, getBookingById: booking, getMyActivityBookings: [booking,
    { ...booking, id: 'another-booking', passengerId: 'other' }], getMyBookings: [booking] };
  let user = { id: 'holder' }; const actions = [];
  const api = { util: { updateQueryData: (endpoint, arg, recipe) => ({ endpoint, arg, recipe }) },
    endpoints: { getTripById: { select: () => () => ({ data: cache.getTripById }) } } };
  const { applyDriverInterruptionResponse } = loader({ '../bookingApi': { bookingApi: api }, '../tripApi': { tripApi: api } })('store/api/trip/interruptionResponseCache.ts');
  const dispatch = action => { actions.push(action); cache[action.endpoint] = produce(cache[action.endpoint], action.recipe); };
  return { cache, actions, setUser: value => { user = value; }, apply: (response, override = scope) => applyDriverInterruptionResponse(response, override)(dispatch, () => ({ auth: { user } })) };
}

test('confirmed pause updates detail and activity caches without completing or charging a group booking', () => {
  const h = harness(); const otherBooking = h.cache.getMyActivityBookings[1]; h.apply(paused);
  assert.equal(h.cache.getTripById.status, 'upcoming');
  assert.equal(h.cache.getBookingById.tripInterruptionRequest.status, 'confirmed');
  assert.equal(h.cache.getMyActivityBookings[0].trip.status, 'upcoming');
  assert.equal(h.cache.getMyBookings[0].tripInterruptionRequest.status, 'confirmed');
  const { getPassengerInterruptionChoice } = loader()('features/trip/interruptionChoice.ts');
  assert.deepEqual(getPassengerInterruptionChoice(h.cache.getMyActivityBookings[0], 'holder'), scopeWithoutHolder());
  for (const field of ['status', 'numberOfSeats', 'pickedUp', 'droppedOff', 'paymentMode', 'paymentAmount']) {
    assert.equal(h.cache.getBookingById[field], booking[field]);
  }
  assert.equal(h.cache.getMyActivityBookings[1], otherBooking);
  assert.equal(h.cache.getMyActivityBookings[1].tripInterruptionRequest.status, 'pending', 'other bookings remain untouched');
});
function scopeWithoutHolder() { return { tripId: 'trip', bookingId: 'booking', requestId: 'request' }; }

test('partial confirmation never pauses everyone before the server confirms all reservations', () => {
  const h = harness();
  h.apply({ ...paused, status: 'ongoing', interruptionRequest: { ...paused.interruptionRequest, status: 'pending' } });
  assert.equal(h.cache.getTripById.status, 'ongoing');
  const { getPassengerInterruptionChoice } = loader()('features/trip/interruptionChoice.ts');
  assert.equal(getPassengerInterruptionChoice(h.cache.getMyActivityBookings[0], 'holder'), null);
});

test('refusal clears the old interruption from this booking instead of restoring it from nested trip data', () => {
  const h = harness(); h.apply({ ...trip, interruptionRequest: null });
  assert.equal(h.cache.getTripById.interruptionRequest, null);
  assert.equal(h.cache.getBookingById.trip.interruptionRequest, null);
  assert.equal(h.cache.getMyActivityBookings[0].tripInterruptionRequest, null);
});

test('responses cannot cross accounts, trips, interruption requests or newer terminal trip states', () => {
  const h = harness(); h.setUser({ id: 'other' }); h.apply(paused); assert.equal(h.actions.length, 0);
  h.setUser(null); h.apply(paused); assert.equal(h.actions.length, 0);
  h.setUser({ id: 'holder' }); h.apply({ ...paused, id: 'elsewhere' }); assert.equal(h.actions.length, 0);
  h.apply({ ...paused, interruptionRequest: { ...paused.interruptionRequest, id: 'other-request' } }); assert.equal(h.actions.length, 0);
  h.cache.getTripById = { ...trip, interruptionRequest: { ...request, id: 'new-request' } };
  h.apply(paused); assert.equal(h.actions.length, 0);
  h.cache.getTripById = { ...trip, status: 'completed' }; h.apply(paused); assert.equal(h.actions.length, 0);
  h.cache.getTripById = { ...trip, interruptionRequest: { ...request, status: 'completed' } };
  h.apply(paused); assert.equal(h.actions.length, 0);
});
