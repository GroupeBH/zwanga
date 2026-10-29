const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('@reduxjs/toolkit/query');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const trip = { id: 'trip', driverId: 'driver', status: 'ongoing' };
const booking = { id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'accepted' };

function navigation(t, role) {
  const hooks = hookHarness();
  const state = { active: true, focused: true, online: true, userId: role, session: 1, id: role === 'driver' ? 'trip' : 'booking' };
  const counts = { trip: 0, booking: 0, bookings: 0, writes: 0 }, options = {};
  const api = createApi({ reducerPath: 'navAudit', tagTypes: ['Trip', 'Booking'],
    baseQuery: async name => { counts[name]++; return { data: name === 'trip' ? trip : name === 'booking' ? booking : [booking] }; },
    endpoints: build => ({
      trip: build.query({ query: () => 'trip', providesTags: ['Trip'] }),
      booking: build.query({ query: () => 'booking', providesTags: ['Booking'] }),
      bookings: build.query({ query: () => 'bookings', providesTags: ['Booking'] }),
    }) });
  const store = configureStore({ reducer: { navAudit: api.reducer }, middleware: defaults => defaults().concat(api.middleware) });
  // Wire real RTK subscriptions to the production hook's options, without native rendering.
  const query = name => (id, opts) => {
    options[name] = opts;
    const handle = hooks.react.useRef();
    hooks.react.useEffect(() => {
      if (opts.skip) return;
      handle.current = store.dispatch(api.endpoints[name].initiate(id, {
        forceRefetch: opts.refetchOnMountOrArgChange,
        subscriptionOptions: { pollingInterval: opts.pollingInterval },
      }));
      return () => { handle.current.unsubscribe(); handle.current = undefined; };
    }, [id, opts.skip, opts.pollingInterval]);
    const data = opts.skip ? undefined : api.endpoints[name].select(id)(store.getState()).data;
    return { currentData: data, refetch: () => {
      assert.ok(handle.current, 'a skipped query must never be refetched'); return handle.current.refetch();
    } };
  };
  const mutate = () => { counts.writes++; return { unwrap: async () => ({}) }; };
  const mutation = () => [mutate, { isLoading: false }];
  const tripApi = { useGetTripByIdQuery: query('trip') };
  for (const name of ['useCancelDriverTripInterruptionMutation', 'useCompleteTripMutation', 'useLazyGetDriverLocationQuery',
    'usePauseTripMutation', 'useRequestDriverTripInterruptionMutation', 'useStartTripMutation', 'useUpdateDriverLocationMutation',
    'useConfirmDriverTripInterruptionMutation', 'useRejectDriverTripInterruptionMutation']) tripApi[name] = mutation;
  const bookingApi = { useGetTripBookingsQuery: query('bookings'), useGetBookingByIdQuery: query('booking') };
  for (const name of ['useAcceptBookingMutation', 'useCancelBookingMutation', 'useConfirmPassengerTripInterruptionMutation',
    'useRejectPassengerTripInterruptionMutation', 'useRejectBookingMutation', 'useRequestPassengerTripInterruptionMutation',
    'useUpdatePassengerLocationMutation']) bookingApi[name] = mutation;
  const load = loader({ react: hooks.react,
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog() {} }) },
    '@/hooks/useAppIsActive': { useAppIsActive: () => state.active },
    '@react-navigation/native': { useIsFocused: () => state.focused },
    'expo-router': { useLocalSearchParams: () => ({ id: state.id }), useRouter: () => ({}) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({}) },
    '@/store/hooks': { useAppDispatch: () => store.dispatch, useAppSelector: fn => fn({
      auth: { user: { id: state.userId } }, zwangaApi: { config: { online: state.online } },
    }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.session },
    '@/hooks/navigation/useOfflineRideData': { useOfflineRideData: (_key, live, error) => ({
      data: [401, 403, 404].includes(error?.status) ? undefined : live, offline: !!error,
    }) },
    '@/store/api/tripApi': tripApi, '@/store/api/bookingApi': bookingApi,
    '@/store/api/googleMapsApi': { useGetDirectionsMutation: mutation },
    '@/store/api/trackingApi': { useCreateTripShareLinkMutation: mutation },
    '@/store/api/driverSettlementsApi': { useLazyGetDriverTripRevenueSummaryQuery: mutation },
    '@/store/api/booking/passengerInterruptionResponseCache': { applyPassengerInterruptionResponse() {} },
    '@/store/api/booking/driverDecisionCache': { applyDriverBookingDecision() {} },
    '@/store/api/trip/interruptionResponseCache': { applyDriverInterruptionResponse() {} },
    './useDriverLocationFallback': { useDriverLocationFallback: () => undefined },
    '@/hooks/arrival-payment/useSyncArrivedPaymentBooking': { useSyncArrivedPaymentBooking() {} },
  });
  const hook = role === 'driver' ? load('hooks/driver-navigation/useDriverNavigationData.ts').useDriverNavigationData
    : load('hooks/passenger-navigation/usePassengerNavigationData.ts').usePassengerNavigationData;
  const render = () => hooks.render(hook);
  const settle = async () => { let view; for (let i = 0; i < 8; i++) { await tick(); view = render(); } return view; };
  t.after(() => { hooks.unmount(); store.dispatch(api.util.resetApiState()); });
  return { state, counts, options, render, settle, invalidate: () => store.dispatch(api.util.invalidateTags(['Trip', 'Booking'])) };
}

for (const role of ['driver', 'passenger']) {
  test(`${role}: hidden navigation unsubscribes; invalidations do not fetch until returning`, async t => {
    const f = navigation(t, role); f.render(); const initial = await f.settle();
    assert.equal(initial.trip.id, 'trip'); assert.equal(f.counts.trip, 1);
    const name = role === 'driver' ? 'bookings' : 'booking';
    assert.equal(f.counts[name], 1);
    const oldRefetch = role === 'driver' ? initial.refetchBookings : initial.refetchBooking;
    f.state.focused = false; const hidden = f.render();
    assert.equal(hidden.trip.id, 'trip'); assert.equal(hidden.isTripOngoing, true, 'blur must not imply trip completion');
    assert.equal(f.options.trip.skip, true); assert.equal(f.options[name].skip, true);
    assert.equal(f.options[name].pollingInterval, 0);
    f.invalidate(); await f.settle();
    assert.equal(f.counts.trip, 1); assert.equal(f.counts[name], 1, 'no extra screen read on socket invalidation');
    assert.ok((await oldRefetch()).error); assert.equal(f.counts[name], 1);
    // Pending business operations are deliberately not cancelled by display scheduling.
    await (role === 'driver' ? hidden.acceptBooking : hidden.cancelBooking)('booking').unwrap();
    assert.equal(f.counts.writes, 1);
    f.state.focused = true; f.render(); const resumed = await f.settle();
    assert.equal(resumed.trip.id, 'trip'); assert.equal(f.counts.trip, 2); assert.equal(f.counts[name], 2);
    assert.equal(f.options[name].pollingInterval, role === 'driver' ? 20_000 : 60_000);
  });

  test(`${role}: offline/background suspension keeps the trip; route/account changes discard it`, async t => {
    const f = navigation(t, role); f.render(); const initial = await f.settle();
    const name = role === 'driver' ? 'bookings' : 'booking';
    for (const flag of ['online', 'active']) {
      f.state[flag] = false; f.render(); f.invalidate(); const view = await f.settle();
      assert.equal(view.trip.id, 'trip'); assert.equal(f.options[name].skip, true);
      assert.ok((await initial.refetchTrip()).error);
      f.state[flag] = true;
    }
    assert.equal(f.counts.trip, 1); assert.equal(f.counts[name], 1);
    f.state.online = false; f.state.userId = 'another-account'; f.state.session++; const other = f.render();
    assert.equal(other.trip, undefined); assert.equal(other.booking ?? other.bookings, undefined);
    f.state.id = 'another-route'; assert.equal(f.render().trip, undefined);
  });
}

test('offline cold start uses the account snapshot; access denial survives blur and prevents fallback', async () => {
  const hooks = hookHarness(); let scope = 'booking', session = 1, read = {}, online = false;
  const load = loader({ react: hooks.react, '@/services/tokenSession': { getTokenSessionVersion: () => session },
    '@/store/hooks': { useAppSelector: fn => fn({ auth: { user: { id: 'passenger' } } }) },
    '@/features/ride-recovery/offlineRideSnapshots': { loadRideSnapshot: async (_user, key) => key === 'booking' ? booking : undefined,
      removeRideSnapshot: async () => {}, saveRideSnapshot: async () => {} },
  });
  const { useNavigationReadData } = load('hooks/navigation/useNavigationReadData.ts');
  const { useOfflineRideData } = load('hooks/navigation/useOfflineRideData.ts');
  const render = () => hooks.render(() => {
    const snapshot = useNavigationReadData(`passenger:${scope}`, read, online);
    return useOfflineRideData(scope, snapshot.data, snapshot.error, true);
  });
  render(); await tick(); assert.equal(render().data.id, 'booking'); assert.equal(render().offline, true);
  read = { currentData: booking, error: { status: 403 } }; online = true;
  assert.equal(render().data, undefined);
  read = {}; online = false; assert.equal(render().data, undefined, 'blur cannot erase the server denial');
  scope = 'other-booking'; session++; assert.equal(render().data, undefined);
  hooks.unmount();
});
