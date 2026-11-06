const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const load = loader();
const { counterOfferPrice, pendingPriceOffers } = load('features/request-detail/counterOfferPolicy.ts');
const { parseRideAlert, isRideResponseOpen } = load('features/notifications/rideAlert.ts');
const { parseRideRealtimeEvent } = load('features/notifications/rideRealtime.ts');
const { passengerResponseNotice } = load('features/notifications/passengerResponseNotice.ts');
const passengerId = '11111111-1111-4111-8111-111111111111', tripRequestId = '22222222-2222-4222-8222-222222222222';
const offerId = '33333333-3333-4333-8333-333333333333';
test('price accepts positive whole FC only, bounded, without silently truncating a decimal', () => {
  assert.equal(counterOfferPrice(' 1500 '), 1500);
  for (const price of ['', '0', '-1', 'NaN', '1e3', '1000001', '1.5', '1,5']) assert.equal(counterOfferPrice(price), null);
});
test('price decisions exclude shared trips and any assigned or closed request', () => {
  const request = { status: 'offers_received', offers: [{ id: 'price', status: 'pending' },
    { id: 'shared', status: 'pending', existingTripId: 'trip' }, { id: 'old', status: 'cancelled' }] };
  assert.deepEqual(pendingPriceOffers(request).map(o => o.id), ['price']);
  for (const patch of [{ status: 'cancelled' }, { selectedDriverId: 'driver' }, { tripId: 'trip' }])
    assert.deepEqual(pendingPriceOffers({ ...request, ...patch }), []);
});
test('counter proposal rings as an offer, not an acceptance; socket and push share one identity', () => {
  const data = { type: 'driver_offer', ringAlert: 'counter-offer-v1', passengerId, tripRequestId, offerId,
    ringUntil: new Date(Date.now() + 60000).toISOString() };
  const alert = parseRideAlert(data); assert.equal(alert.kind, 'response'); assert.equal(alert.expiresAt, data.ringUntil);
  assert.match(passengerResponseNotice(alert).title, /propose un autre prix/);
  assert.equal(isRideResponseOpen(alert, `/request/${tripRequestId}`), false, 'route focus is not a price decision');
  assert.ok(parseRideRealtimeEvent({ kind: 'incoming', recipientId: passengerId, eventId: offerId, data }));
  assert.equal(parseRideRealtimeEvent({ kind: 'incoming', recipientId: tripRequestId, eventId: offerId, data }), null);
  assert.notEqual(parseRideAlert({ ...data, offerId: passengerId }).key, alert.key);
  assert.equal(parseRideAlert({ ...data, offerId: 'invalid' }), null);
});
