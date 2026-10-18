const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { getTripArrivalPreview, isApproximateArrival } = loader()('utils/tripArrivalPreview.ts');
const trip = { id: 'trip', status: 'upcoming', departureTime: '2026-09-17T10:00:00Z', arrivalTime: '2026-09-17T10:00:00Z',
  departure: { lat: -4.3, lng: 15.3 }, arrival: { lat: -4.4, lng: 15.4 } };

test('list arrival uses backend duration or its dated preview without changing trip price', () => {
  assert.equal(getTripArrivalPreview({ ...trip, estimatedDurationSeconds: 1200 }).toISOString(), '2026-09-17T10:20:00.000Z');
  assert.equal(getTripArrivalPreview({ ...trip, arrivalTime: '2026-09-17T10:35:00Z', estimatedDurationSeconds: 1200 }).toISOString(), '2026-09-17T10:35:00.000Z');
  assert.equal(isApproximateArrival({ ...trip, arrivalEstimateSource: 'route' }), false);
  assert.equal(isApproximateArrival({ ...trip, arrivalEstimateSource: 'approximate' }), true);
  assert.equal(isApproximateArrival(trip), true);
});

test('missing/invalid coordinates and dates have honest unavailable results; legacy estimates stay local', () => {
  assert.ok(getTripArrivalPreview(trip).getTime() > Date.parse(trip.departureTime));
  assert.equal(getTripArrivalPreview({ ...trip, departureTime: 'bad' }), null);
  assert.equal(getTripArrivalPreview({ ...trip, arrival: { ...trip.arrival, hasCoordinates: false } }), null);
  assert.equal(getTripArrivalPreview({ ...trip, arrivalEstimateSource: 'unavailable' }), null);
  assert.equal(getTripArrivalPreview(null), null);
  assert.equal(getTripArrivalPreview({ ...trip, status: 'completed', startedAt: '2026-09-17T10:10:00Z', estimatedDurationSeconds: 1200 }).toISOString(), '2026-09-17T10:30:00.000Z');
});

test('rendering 100 list previews schedules no network, native interactions or timers', t => {
  const hooks = hookHarness(), forbidden = () => assert.fail('list previews must not schedule I/O');
  const { useTripArrivalTime } = loader({ react: hooks.react,
    '@/utils/routeApi': { getRouteInfo: forbidden, getLocalRouteInfo: forbidden },
    'react-native': { InteractionManager: { runAfterInteractions: forbidden } },
  })('hooks/useTripArrivalTime.ts');
  t.mock.method(global, 'setTimeout', forbidden);
  for (let i = 0; i < 100; i++) assert.ok(hooks.render(() => useTripArrivalTime({ ...trip, id: String(i) })) instanceof Date);
  hooks.unmount();
});

test('trip mapper and nested booking mapper preserve backend arrival metadata', () => {
  const load = loader();
  const { mapServerTripToClient } = load('store/api/trip/tripMapper.ts');
  const { mapServerBookingToClient } = load('store/api/booking/bookingMapper.ts');
  const server = { id: 'trip', departureDate: trip.departureTime, pricePerSeat: 5000, availableSeats: 2,
    previewArrivalDate: '2026-09-17T10:20:00Z', estimatedDurationSeconds: 1200, arrivalEstimateSource: 'route' };
  const result = mapServerTripToClient(server);
  assert.equal(result.arrivalTime, server.previewArrivalDate); assert.equal(result.price, 5000);
  assert.equal(result.estimatedDurationSeconds, 1200); assert.equal(result.arrivalEstimateSource, 'route');
  assert.equal(mapServerBookingToClient({ id: 'b', trip: server }).trip.arrivalTime, server.previewArrivalDate);
});
