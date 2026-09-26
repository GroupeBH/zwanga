const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(r => setImmediate(r));
function fixture(t) {
  const h = hookHarness(), starts = [], stops = [], sent = [];
  let subscriber, removes = 0;
  const state = { active: true, user: { id: 'me' }, trips: [{ id: 'own', driverId: 'me', status: 'ongoing' }],
    bookings: [{ id: 'booking', tripId: 'other', passengerId: 'me', status: 'accepted',
      trip: { id: 'other', driverId: 'another', status: 'ongoing' } }], snapshot: undefined };
  const load = loader({ react: h.react,
    '@/store/hooks': { useAppSelector: select => select(state) },
    '@/store/selectors': { selectIsAuthenticated: s => Boolean(s.user), selectUser: s => s.user },
    '@/store/api/tripApi': { useGetMyActivityTripsQuery: () => ({ data: state.trips, isSuccess: true }),
      useGetTripByIdQuery: () => ({ currentData: state.snapshot, data: { id: 'stale', status: 'completed' } }) },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: () => ({ data: state.bookings, isSuccess: true }) },
    '@/hooks/useActivityTrackingSignal': { useActivityTrackingSignal: () => null },
    '@/hooks/useAppIsActive': { useAppIsActive: () => state.active },
    'expo-router': { usePathname: () => '/home' },
    'expo-location': { PermissionStatus: { GRANTED: 'granted' }, Accuracy: { High: 4 },
      getForegroundPermissionsAsync: async () => ({ status: 'granted' }) },
    '@/services/driverBackgroundLocationTask': {
      startDriverBackgroundLocationTracking: async id => { starts.push(`driver:${id}`); return true; },
      stopDriverBackgroundLocationTracking: async id => { stops.push(['driver', id]); } },
    '@/services/passengerBackgroundLocationTask': {
      startPassengerBackgroundLocationTracking: async id => { starts.push(`passenger:${id}`); return true; },
      stopPassengerBackgroundLocationTracking: async id => { stops.push(['passenger', id]); },
      sendPassengerLocationSample: async (id, fix) => { sent.push([id, fix]); } },
    '@/services/rideLocationBootstrap': { subscribeBootstrappedRideLocation: (_key, _options, listener) => {
      subscriber = listener; return { remove: () => removes++ }; } },
  });
  const Component = load('components/ActiveRideLocationCoordinator.tsx').ActiveRideLocationCoordinator;
  t.after(() => h.unmount());
  return { state, starts, stops, sent, removes: () => removes, emit: fix => subscriber(fix), render: () => h.render(Component) };
}
test('coordinator uses passenger role and current query args; after dropoff its foreground sender is released', async t => {
  const f = fixture(t); f.render(); await tick();
  assert.deepEqual(f.starts, ['passenger:booking']);
  f.emit({ timestamp: 1 }); assert.equal(f.sent.length, 1);
  f.state.trips = [];
  f.state.bookings = [{ ...f.state.bookings[0], droppedOffAt: '2026-09-25' }];
  f.render(); await tick();
  assert.equal(f.removes(), 1); f.emit({ timestamp: 2 }); assert.equal(f.sent.length, 1);
  assert(f.stops.some(([role]) => role === 'passenger'));
});
test('terminal trip detail stops tracking even when the activity booking is still ongoing', async t => {
  const f = fixture(t); f.state.trips = []; f.render(); await tick();
  f.state.snapshot = { id: 'other', status: 'completed' }; f.render(); await tick();
  assert.equal(f.removes(), 1); assert.equal(f.starts.length, 1);
});

test('foreground resume rechecks the unchanged passenger GPS session without stopping background tracking', async t => {
  const f = fixture(t); f.state.trips = []; f.render(); await tick();
  const stopsBefore = f.stops.length;
  f.state.active = false; f.render(); await tick();
  assert.equal(f.starts.length, 1);
  assert.equal(f.stops.length, stopsBefore);
  assert.equal(f.removes(), 1);
  f.state.active = true; f.render(); await tick();
  assert.deepEqual(f.starts, ['passenger:booking', 'passenger:booking']);
  assert.equal(f.stops.length, stopsBefore);
});
