const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture() {
  const h = hookHarness(), calls = { mutations: [], dialogs: [], navigation: [], commits: [], refresh: [], edit: 0, home: 0 };
  const env = { version: 1, online: true, responses: {} };
  const mutate = name => arg => { calls.mutations.push({ name, arg }); return { unwrap: async () => {
    if (env.responses[name] instanceof Error) throw env.responses[name];
    return env.responses[name] ?? { ...model.data.trip, status: 'ongoing' };
  } }; };
  const mutation = name => () => [mutate(name), { isLoading: false }];
  const model = { data: { tripId: 'trip', user: { id: 'owner' }, isTripDriver: true, isScreenActive: true,
    trip: { id: 'trip', driverId: 'owner', status: 'upcoming', departureTime: '2030-01-01T09:00:00Z',
      arrival: { lat: -4.4, lng: 15.3 } }, tripBookings: [], bookingsFetching: false, bookingsError: false,
    router: { push: route => calls.navigation.push(route) }, showDialog: dialog => calls.dialogs.push(dialog),
    refetchTrip: async () => { calls.refresh.push('trip'); return { data: model.data.trip }; },
    refetchTripBookings: async () => { calls.refresh.push('bookings'); return env.bookingSnapshot ?? { data: model.data.tripBookings }; },
    goHome: () => calls.home++, lastKnownLocation: null,
  }, bookingState: { cancelBookingMutation: mutate('cancelBooking'), isCancellingBooking: false },
  editing: { edit: { isSavingTrip: false }, editor: { openEditModal: () => calls.edit++ } } };
  const load = loader({ react: h.react,
    'react-native': { StyleSheet: { create: x => x }, Platform: { OS: 'ios' } },
    '@/store/api/bookingApi': { useAcceptBookingMutation: mutation('accept'), useRejectBookingMutation: mutation('reject') },
    '@/store/api/tripApi': { useStartTripMutation: mutation('start'), usePauseTripMutation: mutation('pause'),
      useRequestDriverTripInterruptionMutation: mutation('interrupt'), useUpdateTripMutation: mutation('update') },
    '@/store/hooks': { useAppDispatch: () => action => calls.commits.push(action),
      useAppSelector: selector => selector({ zwangaApi: { config: { online: env.online } } }) },
    '@/store/api/booking/driverDecisionCache': { applyDriverBookingDecision: (...args) => args },
    '@/services/tokenSession': { getTokenSessionVersion: () => env.version },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/constants/network': { MUTATION_RECONCILIATION_DELAYS_MS: [0] },
    '@/hooks/notifications/useRideEntryAnnouncement': { useRideEntryAnnouncement() {} },
    '@/features/notifications/detailEntryAnnouncement': { buildManageTripEntry: () => null },
    '@/hooks/navigation/useTripStartTransition': { useTripStartTransition: () => ({ isCurrent: () => true, begin: () => true,
      finish() {}, openNavigation: trip => calls.navigation.push(`/trip/navigate/${trip.id}`) }) },
  });
  const { useDriverTripWorkspace } = load('hooks/trip-detail/useDriverTripWorkspace.ts');
  return { env, h, model, calls, render: () => h.render(() => useDriverTripWorkspace(model)),
    confirm: () => calls.dialogs.at(-1).actions.find(action => action.onPress).onPress() };
}

test('owner detail edits in place and starts with confirmation through the existing API transition', async () => {
  const f = fixture(), w = f.render();
  assert.equal(w.ready, true);
  w.actions.handleOpenTripEdit(); assert.equal(f.calls.edit, 1); assert.deepEqual(f.calls.navigation, []);
  await w.actions.handleStartTrip(); assert.deepEqual(f.calls.mutations, []);
  await f.confirm();
  assert.deepEqual(f.calls.mutations, [{ name: 'start', arg: 'trip' }]);
  assert.deepEqual(f.calls.navigation, ['/trip/navigate/trip']);
  f.h.unmount();
});

test('header cancellation still confirms once and uses the existing cancellation endpoint', async () => {
  const f = fixture(); f.render().actions.handleCancelTrip();
  assert.equal(f.calls.mutations.length, 0);
  await Promise.all([f.confirm(), f.confirm()]);
  assert.deepEqual(f.calls.mutations, [{ name: 'update', arg: { id: 'trip', updates: { status: 'cancelled' } } }]);
  assert.equal(f.calls.home, 1); f.h.unmount();
});

for (const change of ['blur', 'unmount', 'session', 'trip', 'owner', 'status', 'bookings', 'offline']) {
  test(`a confirmation captured before ${change} cannot mutate the old trip`, async () => {
    const f = fixture(); f.render().actions.handleCancelTrip();
    if (change === 'blur') f.model.data = { ...f.model.data, isScreenActive: false };
    if (change === 'unmount') f.h.unmount();
    if (change === 'session') f.env.version++;
    if (change === 'trip') f.model.data = { ...f.model.data, tripId: 'other' };
    if (change === 'owner') f.model.data = { ...f.model.data, user: { id: 'other' }, isTripDriver: false };
    if (change === 'status') f.model.data = { ...f.model.data, trip: { ...f.model.data.trip, status: 'ongoing' } };
    if (change === 'bookings') f.model.data = { ...f.model.data, tripBookings: [{ id: 'new' }] };
    if (change === 'offline') f.env.online = false;
    if (change !== 'unmount') f.render();
    await f.confirm(); assert.equal(f.calls.mutations.length, 0); f.h.unmount();
  });
}

test('start/pause readiness distinguishes missing, refreshing, failed and offline reservations from empty success', () => {
  const f = fixture();
  for (const patch of [{ tripBookings: undefined }, { bookingsFetching: true }, { bookingsError: true }, { tripFetching: true }]) {
    const original = f.model.data;
    f.model.data = { ...original, ...patch }; assert.equal(f.render().ready, false);
    f.model.data = original;
  }
  f.env.online = false; assert.equal(f.render().ready, false);
  f.env.online = true; assert.equal(f.render().ready, true);
  f.h.unmount();
});

test('driver detail accepts the displayed fare proposal, commits to existing cache and refreshes both reads', async () => {
  const f = fixture();
  const booking = { id: 'booking', tripId: 'trip', status: 'pending', numberOfSeats: 2, proposedPricePerSeat: 2500 };
  f.model.data.tripBookings = [booking]; f.env.responses.accept = { ...booking, status: 'accepted' };
  const w = f.render(); await Promise.all([w.bookingsActions.handleAcceptBooking('booking'), w.bookingsActions.handleAcceptBooking('booking')]);
  assert.deepEqual(f.calls.mutations, [{ name: 'accept', arg: { id: 'booking', acceptedPricePerSeat: 2500 } }]);
  assert.equal(f.calls.commits.length, 1); assert.equal(f.calls.commits[0][1], 'accepted');
  assert.deepEqual(f.calls.refresh, ['trip', 'bookings']); f.h.unmount();
});

test('failed booking reads block accept/refuse, preserving the pending reservation', async () => {
  const f = fixture(); f.model.data.bookingsError = true;
  const booking = { id: 'booking', tripId: 'trip', status: 'pending' }; f.model.data.tripBookings = [booking];
  const w = f.render(); await w.bookingsActions.handleAcceptBooking('booking'); await w.bookingsActions.handleRejectBooking(booking);
  assert.deepEqual(f.calls.mutations, []); assert.equal(booking.status, 'pending'); f.h.unmount();
});

test('cancellation failure stays in detail with feedback, without false success navigation', async () => {
  const f = fixture(); f.env.responses.update = new Error('offline');
  f.render().actions.handleCancelTrip(); await f.confirm();
  assert.equal(f.calls.home, 0); assert.equal(f.render().feedback.type, 'error'); f.h.unmount();
});

test('leaving during confirmation completion releases busy state on return without navigating in the background', async () => {
  const f = fixture(); let resolve;
  f.env.responses.update = new Promise(done => { resolve = done; });
  f.render().actions.handleCancelTrip(); const pending = f.confirm();
  assert.equal(f.render().busy, true);
  f.model.data = { ...f.model.data, isScreenActive: false }; f.render();
  resolve({ ...f.model.data.trip, status: 'cancelled' }); await pending;
  f.model.data = { ...f.model.data, isScreenActive: true };
  assert.equal(f.render().busy, false); assert.equal(f.calls.home, 0); f.h.unmount();
});

for (const snapshot of ['failed', 'foreign', 'current']) {
  test(`ambiguous booking response only trusts a successful current-trip read: ${snapshot}`, async () => {
    const f = fixture();
    const booking = { id: 'booking', tripId: 'trip', status: 'pending' };
    f.model.data.tripBookings = [booking];
    f.env.responses.accept = Object.assign(new Error('lost response'), { status: 'FETCH_ERROR' });
    f.env.bookingSnapshot = { data: [{ ...booking, status: 'accepted', tripId: snapshot === 'foreign' ? 'other' : 'trip' }],
      ...(snapshot === 'failed' ? { error: { status: 'FETCH_ERROR' } } : {}) };
    await f.render().bookingsActions.handleAcceptBooking('booking');
    assert.equal(f.calls.mutations.length, 1, 'never replay an ambiguous write');
    assert.equal(f.calls.commits.length, snapshot === 'current' ? 1 : 0);
    assert.equal(f.render().feedback.type, snapshot === 'current' ? 'success' : 'error');
    f.h.unmount();
  });
}
