const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const model = loader()('features/passenger-navigation/passengerRideProgress.ts');
const trip = { id: 'trip', driverId: 'driver', tripRequestId: 'request', status: 'ongoing' };
const booking = { id: 'booking', tripId: trip.id, trip, passengerId: 'passenger', status: 'accepted',
  createdAt: '2026-11-25T10:00:00Z', updatedAt: '2026-11-25T10:00:00Z', pickedUp: false, droppedOff: false, paymentStatus: 'pending' };
const picked = { ...booking, pickedUp: true, pickedUpAt: '2026-11-25T10:01:00Z', updatedAt: '2026-11-25T10:01:00Z',
  pickupDetectionMethod: 'manual_driver_confirmation', pickedUpConfirmedByPassenger: false };
const dropped = { ...picked, droppedOff: true, droppedOffAt: '2026-11-25T10:20:00Z', updatedAt: '2026-11-25T10:20:00Z',
  status: 'completed', dropoffDetectionMethod: 'manual_driver_confirmation', droppedOffConfirmedByPassenger: false };

test('manual driver pickup is in transit without a passenger vote, dropoff is arrived without inventing a payment', () => {
  assert.equal(model.passengerNavigationStatus(booking, trip), 'waiting_pickup');
  assert.equal(model.passengerNavigationStatus(picked, trip), 'in_transit');
  assert.equal(model.passengerNavigationStatus(dropped, trip), 'completed');
  assert.equal(model.passengerNavigationStatus({ ...picked, pickedUp: false }, trip), 'in_transit');
  assert.equal(model.passengerNavigationStatus(booking, { ...trip, status: 'upcoming' }), 'not_started');
  assert.equal(model.passengerRideStage({ ...booking, passengerDistanceToDestination: 0 }), 'waiting');
  assert.equal(dropped.paymentStatus, 'pending');
});

test('monitor the passenger of the reservation regardless of account role, not a driver or an old completed ride', () => {
  assert.equal(model.isPassengerRideMonitored(booking, 'passenger'), true);
  assert.equal(model.isPassengerRideMonitored(booking, 'driver'), false);
  assert.equal(model.isPassengerRideMonitored(dropped, 'passenger'), false);
  assert.equal(model.isPassengerRideMonitored({ ...booking, trip: { ...trip, status: 'upcoming' } }, 'passenger'), true);
  assert.equal(model.isPassengerRideMonitored({ ...booking, trip: { ...trip, status: 'upcoming', tripRequestId: null } }, 'passenger'), false);
  assert.equal(model.isPassengerRideMonitored({ ...booking, trip: { ...trip, departureTime: '2020-01-01', startedAt: '2026-11-25' } }, 'passenger'), true);
});

test('each confirmed transition notifies once; late REST responses, duplicate socket hints and old history do not replay it', () => {
  const tracker = model.createPassengerProgressTracker('passenger');
  assert.equal(tracker.observe({ ...dropped, id: 'old' }), null);
  assert.equal(tracker.observe(booking), null);
  assert.match(tracker.observe(picked).message, /conducteur.*embarquement/);
  assert.equal(tracker.observe(picked), null);
  assert.equal(tracker.observe(booking), null);
  assert.equal(tracker.observe({ ...dropped, updatedAt: booking.updatedAt }), null);
  assert.equal(tracker.observe({ ...dropped, passengerId: 'other' }), null);
  assert.equal(tracker.observe({ ...dropped, tripId: 'replacement' }), null);
  assert.match(tracker.observe(dropped).message, /conducteur.*arrivée/);
  assert.equal(tracker.observe({ ...picked, updatedAt: '2026-11-25T11:00:00Z' }), null);
  assert.equal(tracker.observe(dropped), null);
});

test('resume after missed pickup and dropoff announces the latest stage only; account/session reset never replays history', () => {
  const tracker = model.createPassengerProgressTracker('passenger');
  tracker.observe(booking);
  assert.equal(tracker.observe(dropped).stage, 'dropoff');
  assert.equal(tracker.observe(picked), null);
  assert.equal(model.createPassengerProgressTracker('other').observe(dropped), null);
  assert.equal(model.createPassengerProgressTracker('passenger').observe(dropped), null);
});

const cache = loader({ '../bookingApi': { bookingApi: {} } })('store/api/booking/passengerProgressCache.ts');
test('cache merge preserves identity, newer reads, closed rides and independent trip progress', () => {
  const current = structuredClone(booking);
  cache.mergePassengerProgress(current, picked);
  assert.equal(current.pickedUp, true);
  cache.mergePassengerProgress(current, booking);
  assert.equal(current.pickedUp, true);
  for (const patch of [{ passengerId: 'other' }, { id: 'other' }, { tripId: 'other' }]) {
    cache.mergePassengerProgress(current, { ...dropped, ...patch });
    assert.equal(current.status, 'accepted');
  }
  cache.mergePassengerProgress(current, { ...dropped, trip: { ...trip, status: 'upcoming' } });
  assert.equal(current.trip.status, 'ongoing');
  assert.equal(current.paymentStatus, 'pending');
  cache.mergePassengerProgress(current, { ...picked, updatedAt: '2026-11-25T11:00:00Z' });
  assert.equal(current.droppedOff, true);
});

test('progress push invalidates bookings, trip and requests without navigation or financial mutation', () => {
  const { notificationEffects } = loader()('features/notifications/notificationEffects.ts');
  for (const type of ['pickup_confirmed_automatically', 'dropoff_confirmed_automatically', 'ride_confirmation_required']) {
    const effect = notificationEffects({ data: { type, bookingId: 'booking' } });
    for (const tag of ['Booking', 'Trip', 'TripRequest', 'AccountActivity']) assert.ok(effect.tags.includes(tag));
    assert.equal(effect.href, null);
    assert.ok(!effect.tags.includes('Wallet'));
  }
});

function environment(t) {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const io = { active: true, session: 1, actions: [], reads: [], joins: [], leaves: [], stops: 0,
    read: { currentData: booking }, state: { auth: { user: { id: 'passenger' } }, zwangaApi: { config: { online: true } } },
    lists: { getMyActivityBookings: [structuredClone(booking)], getMyBookings: [structuredClone(booking)],
      getMyBookingsForTrip: [structuredClone(booking)], getTripBookings: [structuredClone(booking)] } };
  const updateQueryData = (endpoint, arg, recipe) => ({ type: 'update', endpoint, arg, recipe });
  const dispatch = action => {
    if (typeof action === 'function') return action(dispatch, () => io.state);
    io.actions.push(action);
    if (action.type === 'update') {
      const old = action.endpoint === 'getBookingById' ? io.read.currentData : io.lists[action.endpoint];
      if (!old) return;
      const next = structuredClone(old); action.recipe(next);
      if (JSON.stringify(old) === JSON.stringify(next)) return;
      if (action.endpoint === 'getBookingById') io.read = { ...io.read, currentData: next };
      else io.lists[action.endpoint] = next;
    }
  };
  const load = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useAppIsActive: () => io.active },
    '@/store/hooks': { useAppSelector: select => select(io.state), useAppDispatch: () => dispatch },
    '@/services/tokenSession': { getTokenSessionVersion: () => io.session },
    '@/store/api/baseApi': { baseApi: { util: { invalidateTags: tags => ({ type: 'invalidate', tags }) } } },
    '@/store/api/bookingApi': { bookingApi: { util: { updateQueryData } },
      useGetMyActivityBookingsQuery: () => ({ data: io.lists.getMyActivityBookings }),
      useGetBookingByIdQuery: (id, options) => { io.reads.push({ id, ...options }); return io.read; } },
    '../bookingApi': { bookingApi: { util: { updateQueryData } } },
    '@/services/trackingSocket': { trackingSocket: {
      joinTrip: async id => { io.joins.push(id); }, leaveTrip: async id => { io.leaves.push(id); },
      subscribeToBookingAutoProgress: cb => { io.progress = cb; return () => { io.stops++; }; },
      subscribeToConnectionState: cb => { io.connected = cb; return () => { io.stops++; }; },
    } },
  });
  const { usePassengerRideProgress } = load('hooks/passenger-navigation/usePassengerRideProgress.ts');
  return { io, render: () => hooks.render(() => usePassengerRideProgress('passenger')) };
}

test('REST fallback synchronizes Home, reservation and detail after driver-only actions even without push', t => {
  const { io, render } = environment(t);
  assert.equal(render().notice, null);
  assert.equal(io.reads.at(-1).pollingInterval, 10000);
  io.read = { currentData: picked };
  render();
  let view = render();
  assert.equal(view.notice.stage, 'pickup');
  for (const list of Object.values(io.lists)) assert.equal(list[0].pickedUp, true);
  view.close();
  assert.equal(render().notice, null);
  render(); assert.equal(render().notice, null);
  io.read = { currentData: dropped };
  render(); view = render();
  assert.equal(view.notice.stage, 'dropoff');
  for (const list of Object.values(io.lists)) assert.equal(list[0].droppedOff, true);
  assert.equal(io.reads.at(-1).skip, true, 'no ongoing polling after dropoff');
  assert.ok(io.actions.some(action => action.type === 'invalidate' && action.tags.some(tag => tag.type === 'Trip')));
  assert.equal(io.lists.getMyActivityBookings[0].paymentStatus, 'pending');
});

test('an activity-list update also refreshes the open detail and informs only once', t => {
  const { io, render } = environment(t); render();
  io.lists.getMyActivityBookings = [picked];
  render();
  assert.equal(io.read.currentData.pickedUp, true);
  const view = render(); assert.equal(view.notice.stage, 'pickup'); view.close();
  render(); assert.equal(render().notice, null);
});

test('a just-closed ride omitted by the activity list retains its final read, notice and payment receipt', t => {
  const { io, render } = environment(t); render();
  io.lists.getMyActivityBookings = [];
  render();
  assert.equal(io.reads.at(-1).id, 'booking');
  assert.equal(io.reads.at(-1).skip, false);
  io.read = { currentData: dropped }; render();
  assert.equal(render().notice.stage, 'dropoff');
  assert.equal(io.lists.getMyActivityBookings[0].droppedOff, true);
  assert.equal(io.lists.getMyActivityBookings[0].paymentStatus, 'pending');
});

test('hidden/offline screens stop monitoring and late socket callbacks cannot refresh after cleanup', async t => {
  const { io, render } = environment(t); render();
  const stale = io.progress;
  io.active = false; render();
  assert.equal(io.reads.at(-1).skip, true);
  assert.equal(io.stops, 2);
  const count = io.actions.length;
  stale({ tripId: 'trip', events: [{ bookingId: 'booking', type: 'pickup_confirmed' }] });
  await new Promise(resolve => setTimeout(resolve, 390));
  assert.equal(io.actions.length, count);
  io.active = true; io.state.zwangaApi.config.online = false; render();
  assert.equal(io.reads.at(-1).skip, true);
  io.state.zwangaApi.config.online = true; io.read = { currentData: dropped }; render();
  assert.equal(render().notice.stage, 'dropoff');
});

test('socket bursts only request authoritative refresh and ignore other bookings', async t => {
  const { io, render } = environment(t); render();
  io.actions.length = 0;
  io.progress({ tripId: 'trip' });
  io.progress({ tripId: 'trip', events: [null] });
  io.progress({ tripId: 'other', events: [{ bookingId: 'booking' }] });
  io.progress({ tripId: 'trip', events: [{ bookingId: 'other' }] });
  await new Promise(resolve => setTimeout(resolve, 390));
  assert.equal(io.actions.length, 0);
  for (let i = 0; i < 4; i++) io.progress({ tripId: 'trip', events: [{ bookingId: 'booking', type: 'dropoff_confirmed' }] });
  io.connected(true);
  await new Promise(resolve => setTimeout(resolve, 390));
  assert.equal(io.actions.filter(action => action.type === 'invalidate').length, 1);
  assert.equal(render().notice, null, 'socket payload alone does not confirm dropoff');
});

test('a closed trip stops monitoring even if its booking status has not caught up', t => {
  const { io, render } = environment(t); render();
  io.read = { currentData: { ...booking, trip: { ...trip, status: 'cancelled' } } };
  render();
  assert.equal(render().notice, null);
  assert.equal(io.reads.at(-1).skip, true);
});

test('definitive denial blocks stale cache; transient failure retries; foreign responses never update passenger state', t => {
  const { io, render } = environment(t); render();
  io.read = { currentData: dropped, error: { status: 503 }, isError: true }; render();
  assert.equal(render().notice, null);
  assert.equal(io.reads.at(-1).skip, false);
  io.read = { currentData: { ...dropped, passengerId: 'other' } }; render();
  assert.equal(render().notice, null);
  io.read = { currentData: dropped, error: { status: 403 }, isError: true }; render();
  assert.equal(render().notice, null);
  assert.equal(io.reads.at(-1).skip, true);
  io.lists.getMyActivityBookings = [dropped]; render();
  assert.equal(render().notice, null, 'late activity cache cannot revive a denied reservation');
});

test('the global confirmation is an in-app overlay below payment/SOS, not a competing native modal', () => {
  const { PassengerRideProgressCoordinator } = loader({ react: React,
    'react-native': { View: 'View', ScrollView: 'Scroll', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: { id: 'passenger' }, isAuthenticated: true } }) },
    '@/store/selectors': { selectUser: state => state.auth.user, selectIsAuthenticated: () => true },
    '@/services/tokenSession': { getTokenSessionVersion: () => 3 },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
    '@/features/navigation/RideOverlayProvider': { useRideOverlay: () => ({ active: null }) },
    '@/hooks/notifications/usePaymentAnnouncement': { useScreenAnnouncement() {} },
    '@/hooks/passenger-navigation/usePassengerRideProgress': { usePassengerRideProgress: () => ({ notice: model.passengerProgressNotice(picked), visible: true, close() {} }) },
  })('components/PassengerRideProgressCoordinator.tsx');
  const session = PassengerRideProgressCoordinator();
  assert.equal(session.key, 'passenger:3');
  const panel = session.type(session.props);
  assert.equal(panel.props.inApp, true);
  assert.equal(panel.props.visible, true);
  assert.equal(panel.props.priority, 10);
});
