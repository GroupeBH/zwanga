const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { mapActivityTrip } = loader()('store/api/trip/activityTripMapper.ts');

test('activity trips reuse embedded payment information without losing locked fares, names or cash confirmations', () => {
  const trip = { id: 'trip', driverId: 'driver', departureLocation: 'Gombe', arrivalLocation: 'Lemba',
    departureDate: '2026-09-17T10:00:00Z', pricePerSeat: 5000, availableSeats: 2, status: 'ongoing',
    bookings: [
      { id: 'electronic', passengerId: 'passenger', numberOfSeats: 2, status: 'completed', paymentMode: 'electronic',
        paymentStatus: 'succeeded', paymentAmount: '1500', paymentCurrency: 'CDF', passenger: { id: 'passenger', firstName: 'Alice', lastName: 'A' } },
      { id: 'cash', numberOfSeats: 1, status: 'completed', paymentMode: 'cash', paymentStatus: 'not_required' },
      { id: 'unpaid', numberOfSeats: 1, status: 'accepted', paymentMode: 'electronic', paymentStatus: 'pending' },
    ] };
  const result = mapActivityTrip(trip);
  assert.equal(result.id, 'trip'); assert.equal(result.departure.name, 'Gombe');
  assert.equal(result.paymentNotices.length, 2);
  assert.deepEqual(result.paymentNotices.map(item => [item.tripId, item.bookingId, item.amount]), [
    ['trip', 'electronic', 1500], ['trip', 'cash', 5000],
  ]);
  assert.equal(result.paymentNotices[0].passengerName, 'Alice A');
  assert.equal(result.paymentNotices[0].mode, 'electronic');
  assert.deepEqual(mapActivityTrip({ ...trip, bookings: undefined }).paymentNotices, []);
});
