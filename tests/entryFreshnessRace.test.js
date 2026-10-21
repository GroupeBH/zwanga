const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi, fakeBaseQuery } = require('@reduxjs/toolkit/query');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('real RTK dedup: pre-foreground empty response cannot consume entry; coordinator replaces it once', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const pending = [], routes = [];
  const section = count => ({ count, revision: 'a'.repeat(64) });
  const summary = live => ({ userId: 'driver', schemaVersion: 1, hasLiveActivity: live,
    passengerTrackingBookingId: null, trips: section(live ? 1 : 0), bookings: section(0), requests: section(0) });
  const api = createApi({ reducerPath: 'activity', baseQuery: fakeBaseQuery(), endpoints: build => ({
    getAccountActivity: build.query({ queryFn: async () => { const task = deferred(); pending.push(task); return task.promise; } }),
  }) });
  const store = configureStore({ reducer: { activity: api.reducer,
    auth: () => ({ isAuthenticated: true, user: { id: 'driver' } }), zwangaApi: () => ({ config: { online: true } }) },
    middleware: getDefault => getDefault().concat(api.middleware) });
  const select = () => api.endpoints.getAccountActivity.select('driver')(store.getState());
  const first = store.dispatch(api.endpoints.getAccountActivity.initiate('driver', { subscribe: false }));
  t.mock.timers.tick(10); const since = Date.now();
  const resumed = store.dispatch(api.endpoints.getAccountActivity.initiate('driver', { subscribe: false, forceRefetch: true }));
  assert.equal(pending.length, 1, 'forceRefetch still shares the old pending request');
  const producer = hookHarness(), consumer = hookHarness();
  const { useActiveRideResume } = loader({ react: consumer.react,
    '@/services/tokenSession': { getTokenSessionVersion: () => 0 },
  })('hooks/navigation/useActiveRideResume.ts');
  const trip = { id: 'trip', driverId: 'driver', status: 'ongoing' };
  const options = { userId: 'driver', active: true, online: true, ready: true, path: '/', overlayBusy: false, since,
    trips: { data: [], isSuccess: true, fulfilledTimeStamp: 100000 }, bookings: { data: [], isSuccess: true, fulfilledTimeStamp: 100000 },
    readTrip: async () => trip, readBooking: async () => {}, replace: path => routes.push(path) };
  const enter = () => consumer.render(() => useActiveRideResume({ ...options, activity: { ...select(), isFetching: select().isLoading } }));
  const list = name => ({ endpoints: { [name]: { select: () => () => ({ data: [], isSuccess: true, fulfilledTimeStamp: Date.now() }),
    initiate: () => ({ type: 'mock/read' }) } }, util: { getRunningQueryThunk: () => ({ type: 'mock/running' }) } });
  const { AccountActivityCoordinator } = loader({ react: producer.react, 'react-redux': { useStore: () => store },
    '@/store/hooks': { useAppDispatch: () => action => action.type === 'mock/running' ? undefined
      : action.type === 'mock/read' ? { unwrap: async () => [] } : store.dispatch(action), useAppSelector: fn => fn(store.getState()) },
    '@/store/selectors': { selectIsAuthenticated: state => state.auth.isAuthenticated },
    '@/hooks/useAppIsActive': { useAppIsActive: () => true, useAppIsForeground: () => true },
    '@/services/appActivity': { getAppActiveSince: () => since, isAppForeground: () => true },
    '@/store/api/accountActivityApi': { accountActivityApi: { ...api, endpoints: { getAccountActivity: {
      ...api.endpoints.getAccountActivity, useQueryState: () => ({ hasLiveActivity: select().data?.hasLiveActivity }) } } },
      useGetAccountActivityQuery: () => ({ ...select(), currentData: select().data, isFetching: select().isLoading }) },
    '@/store/api/tripApi': { tripApi: list('getMyActivityTrips'), useGetMyActivityTripsQuery: () => ({}) },
    '@/store/api/bookingApi': { bookingApi: list('getMyActivityBookings'), useGetMyActivityBookingsQuery: () => ({}) },
    '@/store/api/tripRequestApi': { tripRequestApi: list('getMyActivityRequests'), useGetMyActivityRequestsQuery: () => ({}) },
  })('components/AccountActivityCoordinator.tsx');
  const produce = () => producer.render(AccountActivityCoordinator);
  t.after(() => { producer.unmount(); consumer.unmount(); store.dispatch(api.util.resetApiState()); });
  produce(); enter();
  t.mock.timers.tick(10); pending[0].resolve({ data: summary(false) }); await first; await resumed;
  assert.equal(enter().pending, true, 'late empty snapshot cannot finish entry');
  produce(); await tick(); assert.equal(pending.length, 2);
  for (let i = 0; i < 10; i++) { produce(); enter(); }
  assert.equal(pending.length, 2, 'no per-render requests');
  pending[1].resolve({ data: summary(true) }); await tick();
  options.trips = { data: [trip], isSuccess: true, fulfilledTimeStamp: Date.now() };
  produce(); enter(); await tick(); assert.deepEqual(routes, ['/trip/navigate/trip']);
});
