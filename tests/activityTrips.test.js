const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { mapActivityTrip } = loader()('store/api/trip/activityTripMapper.ts');

test('activity trips preserve electronic receipts and locked fares without inventing cash confirmations', () => {
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
  assert.equal(result.paymentNotices.length, 1);
  assert.deepEqual(result.paymentNotices.map(item => [item.tripId, item.bookingId, item.amount]), [
    ['trip', 'electronic', 1500],
  ]);
  assert.equal(result.paymentNotices[0].passengerName, 'Alice A');
  assert.equal(result.paymentNotices[0].mode, 'electronic');
  assert.deepEqual(mapActivityTrip({ ...trip, bookings: undefined }).paymentNotices, []);
});

test('activity reservation summary counts active bookings without depending on passenger profiles or seat count', () => {
  const trip = { id: 'trip', driverId: 'driver', status: 'upcoming', departureDate: '2026-10-09T10:00:00Z',
    bookings: [
      { id: 'pending', status: 'pending', numberOfSeats: 3 },
      { id: 'accepted', status: 'accepted', numberOfSeats: 2, passenger: null },
      ...['cancelled', 'rejected', 'completed', 'no_show'].map(status => ({ id: status, status, numberOfSeats: 1 })),
      { id: 'finished', status: 'accepted', droppedOff: true },
      { id: 'confirmed-finish', status: 'accepted', droppedOffConfirmedByPassenger: true },
    ] };
  assert.deepEqual(mapActivityTrip(trip).reservationSummary, { pendingBookingIds: ['pending'], acceptedCount: 1 });
  assert.deepEqual(mapActivityTrip({ ...trip, bookings: [] }).reservationSummary, { pendingBookingIds: [], acceptedCount: 0 });
  assert.equal(mapActivityTrip({ ...trip, bookings: undefined }).reservationSummary, undefined);
});
