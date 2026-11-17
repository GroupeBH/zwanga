const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

const builder = { mutation: value => value, query: value => value };
const load = loader({
  './contracts': {},
  './tripMapper': {},
  './bookingMapper': {},
});
const driver = load('store/api/trip/confirmDriverTripInterruption.endpoints.ts')
  .buildConfirmDriverTripInterruptionEndpoints(builder).updateDriverLocation;
const passenger = load('store/api/booking/confirmDropoffByPassenger.endpoints.ts')
  .buildConfirmDropoffByPassengerEndpoints(builder).updatePassengerLocation;
const recordedAt = '2026-11-17T10:00:00.000Z';
const samples = [
  { latitude: -4.32, longitude: 15.30, accuracy: 8, recordedAt: '2026-11-17T09:59:55.000Z' },
  { latitude: -4.321, longitude: 15.301, accuracy: 10, recordedAt },
];

for (const [role, endpoint, identity, coordinates, url] of [
  ['driver', driver, { tripId: 'trip-test' }, { coordinates: [15.301, -4.321] },
    '/trips/trip-test/driver-location'],
  ['passenger', passenger, { bookingId: 'booking-test' }, { latitude: -4.321, longitude: 15.301 },
    '/bookings/booking-test/passenger-location'],
]) {
  // Query builders are real; no network, GPS acquisition or native module is used.
  const serialize = value => JSON.parse(JSON.stringify(value));
  const fix = { ...coordinates, accuracy: 10, speed: 4, heading: 80, recordedAt };

  test(`${role}: location endpoint preserves the existing single-fix HTTP contract`, () => {
    for (const body of [coordinates, fix]) {
      assert.deepEqual(serialize(endpoint.query({ ...identity, ...body })), {
        url, method: 'PUT', body,
      });
    }
  });

  test(`${role}: location endpoint forwards historical samples with their original times and order`, () => {
    const arg = { ...identity, ...fix, samples: structuredClone(samples) };
    const before = structuredClone(arg);
    assert.deepEqual(serialize(endpoint.query(arg)), {
      url, method: 'PUT', body: { ...fix, samples },
    });
    assert.deepEqual(arg, before, 'serializing a GPS batch must not mutate the observations');
  });

  test(`${role}: routine GPS updates and failures do not invalidate trip lists`, () => {
    for (const result of [undefined, {}, { autoProgress: { events: [] } }]) {
      assert.deepEqual(endpoint.invalidatesTags(result, undefined, identity), []);
    }
    assert.deepEqual(endpoint.invalidatesTags(undefined, { status: 503 }, identity), []);
  });
}

test('driver: confirmed automatic progress refreshes only the existing related caches', () => {
  const result = { autoProgress: { events: [
    { tripId: 'trip-test', bookingId: 'booking-test', type: 'pickup_confirmed' },
    { tripId: 'trip-test', type: 'driver_arrived_destination' },
  ] } };
  assert.deepEqual(driver.invalidatesTags(result, undefined, { tripId: 'trip-test' }), [
    { type: 'Trip', id: 'trip-test' },
    { type: 'Trip', id: 'LIST' },
    { type: 'Booking', id: 'LIST' },
    { type: 'Booking', id: 'booking-test' },
  ]);
});

test('passenger: confirmed automatic progress refreshes only the existing related caches', () => {
  const result = { autoProgress: { events: [
    { tripId: 'trip-test', bookingId: 'booking-test', type: 'pickup_confirmed' },
  ] } };
  assert.deepEqual(passenger.invalidatesTags(result, undefined, { bookingId: 'booking-test' }), [
    { type: 'Booking', id: 'booking-test' },
    { type: 'Booking', id: 'LIST' },
    { type: 'Trip', id: 'LIST' },
    { type: 'MyTrips', id: 'LIST' },
    { type: 'Booking', id: 'booking-test' },
    { type: 'Trip', id: 'trip-test' },
  ]);
});
