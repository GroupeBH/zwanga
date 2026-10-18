const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };
const revision = (value = 'a', count = 0) => ({ revision: value.repeat(64), count });
const snapshot = (overrides = {}) => ({ schemaVersion: 1, userId: 'user', hasLiveActivity: false,
  passengerTrackingBookingId: null, trips: revision(), bookings: revision(), requests: revision(), ...overrides });
const { createActivityReconciliation } = loader()('features/activity/activityReconciliation.ts');

test('600 idle snapshots perform no list refetch; a change refreshes only its category, including disappearance', async () => {
  const reads = [], cache = createActivityReconciliation({ hasCachedItems: () => false, load: async key => reads.push(key) });
  for (let i = 0; i < 600; i++) await cache.apply(snapshot());
  assert.deepEqual(reads, []);
  await cache.apply(snapshot({ bookings: revision('b', 1) }));
  assert.deepEqual(reads, ['bookings']);
  for (let i = 0; i < 100; i++) await cache.apply(snapshot({ bookings: revision('b', 1) }));
  assert.equal(reads.length, 1);
  await cache.apply(snapshot());
  assert.deepEqual(reads, ['bookings', 'bookings'], 'empty is reconciled after a previous nonempty state, not discarded');
});

test('failed detail reads retry the same revision without losing the successful categories', async () => {
  const reads = []; let fails = true;
  const cache = createActivityReconciliation({ hasCachedItems: () => true, load: async key => {
    reads.push(key); if (key === 'bookings' && fails) throw Error('offline');
  } });
  await cache.apply(snapshot()); assert.deepEqual(reads, ['trips', 'bookings', 'requests']);
  fails = false; await cache.apply(snapshot()); assert.deepEqual(reads, ['trips', 'bookings', 'requests', 'bookings']);
  await cache.apply(snapshot()); assert.equal(reads.length, 4);
});

test('a failed initial list read is retried even if the empty snapshot has not changed', async () => {
  const reads = []; let failedRead = false;
  const cache = createActivityReconciliation({ hasCachedItems: () => false,
    hasFailedRead: key => key === 'bookings' && failedRead,
    load: async key => reads.push(key) });
  await cache.apply(snapshot()); assert.deepEqual(reads, []);
  failedRead = true;
  await cache.apply(snapshot()); assert.deepEqual(reads, ['bookings']);
  await cache.apply(snapshot()); assert.deepEqual(reads, ['bookings', 'bookings'], 'at most one retry per snapshot');
  failedRead = false;
  await cache.apply(snapshot()); assert.equal(reads.length, 2);
});

test('slow reads coalesce updates, process the newest revision and stop queued work on account change', async () => {
  const reads = [], pending = [];
  const cache = createActivityReconciliation({ hasCachedItems: () => false, load: key => {
    reads.push(key); const task = deferred(); pending.push(task); return task.promise;
  } });
  void cache.apply(snapshot({ bookings: revision('b', 1) })); await flush();
  for (let i = 0; i < 100; i++) void cache.apply(snapshot({ bookings: revision('c', 1) }));
  assert.deepEqual(reads, ['bookings']);
  pending[0].resolve(); await flush(); assert.deepEqual(reads, ['bookings', 'bookings']);
  void cache.apply(snapshot({ bookings: revision('d', 1) }));
  cache.dispose(); pending[1].resolve(); await flush();
  assert.equal(reads.length, 2);
  await cache.apply(snapshot({ requests: revision('b', 1) })); assert.equal(reads.length, 2);
});

test('activity response is validated and account-scoped, without replacing failed reads with empty data', async () => {
  let definition;
  const { isAccountActivity } = loader({ './baseApi': { baseApi: { injectEndpoints: config => {
    definition = config.endpoints({ query: value => value }).getAccountActivity; return {};
  } } } })('store/api/accountActivityApi.ts');
  assert.equal(isAccountActivity(snapshot(), 'user'), true);
  for (const value of [null, {}, snapshot({ userId: 'another' }), snapshot({ schemaVersion: 2 }),
    snapshot({ bookings: { count: -1, revision: 'bad' } })]) assert.equal(isAccountActivity(value, 'user'), false);
  const invoke = response => definition.queryFn('user', {}, {}, async () => response);
  assert.deepEqual(await invoke({ data: snapshot() }), { data: snapshot() });
  for (const status of [401, 404, 503, 'FETCH_ERROR']) assert.deepEqual(await invoke({ error: { status } }), { error: { status } });
  assert.equal((await invoke({ data: snapshot({ userId: 'old-account' }) })).error.status, 'CUSTOM_ERROR');
});

function coordinator() {
  const hooks = hookHarness(), reads = [], poll = [], fallback = [];
  const state = { auth: { user: { id: 'user' }, isAuthenticated: true }, zwangaApi: { config: { online: true } } };
  const env = { active: true, summary: { currentData: snapshot(), fulfilledTimeStamp: 1, isFetching: false, isError: false }, state, reads, poll, fallback };
  const reduxStore = { getState: () => state };
  const dispatch = action => {
    if (action.running) return env.running;
    reads.push(action.key); return { unwrap: () => Promise.resolve([]) };
  };
  const api = (key, name) => ({ endpoints: { [name]: { select: () => () => ({ data: [] }),
    initiate: () => ({ key }) } }, util: { getRunningQueryThunk: () => ({ running: true }) } });
  const { AccountActivityCoordinator } = loader({ react: hooks.react,
    'react-redux': { useStore: () => reduxStore },
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: selector => selector(state) },
    '@/store/selectors': { selectIsAuthenticated: s => s.auth.isAuthenticated },
    '@/hooks/useAppIsActive': { useAppIsActive: () => env.active },
    '@/store/api/accountActivityApi': {
      accountActivityApi: { endpoints: { getAccountActivity: { useQueryState: () => ({ hasLiveActivity: env.summary.currentData?.hasLiveActivity ?? false }) } } },
      useGetAccountActivityQuery: (id, options) => { poll.push({ id, ...options }); return env.summary; },
    },
    '@/store/api/tripApi': { tripApi: api('trips', 'getMyActivityTrips'), useGetMyActivityTripsQuery: (_, options) => fallback.push({ key: 'trips', ...options }) },
    '@/store/api/bookingApi': { bookingApi: api('bookings', 'getMyActivityBookings'), useGetMyActivityBookingsQuery: (_, options) => fallback.push({ key: 'bookings', ...options }) },
    '@/store/api/tripRequestApi': { tripRequestApi: api('requests', 'getMyTripRequests'), useGetMyTripRequestsQuery: (_, options) => fallback.push({ key: 'requests', ...options }) },
  })('components/AccountActivityCoordinator.tsx');
  return Object.assign(env, { hooks, render: () => hooks.render(AccountActivityCoordinator) });
}

test('one coordinator polls at 60s idle / 30s live, pauses offline/background and validates account changes', async () => {
  const app = coordinator(); app.render(); await flush();
  assert.equal(app.poll.at(-1).pollingInterval, 60_000);
  assert.ok(app.fallback.every(options => options.skip)); assert.deepEqual(app.reads, []);
  app.summary = { ...app.summary, currentData: snapshot({ hasLiveActivity: true, bookings: revision('b', 1) }), fulfilledTimeStamp: 2 };
  app.render(); await flush(); assert.equal(app.poll.at(-1).pollingInterval, 30_000); assert.deepEqual(app.reads, ['bookings']);
  app.active = false; app.render(); assert.equal(app.poll.at(-1).skip, true);
  app.active = true; app.state.zwangaApi.config.online = false; app.render(); assert.equal(app.poll.at(-1).skip, true);
  app.state.zwangaApi.config.online = true; app.state.auth.user = { id: 'new-user' }; app.render(); await flush();
  assert.equal(app.poll.at(-1).id, 'new-user'); assert.deepEqual(app.reads, ['bookings'], 'old account snapshot must not trigger a read');
  app.state.auth.isAuthenticated = false; app.render(); assert.equal(app.poll.at(-1).skip, true); app.hooks.unmount();
});

test('only a missing endpoint enables rolling-deployment fallback; transient errors never erase cached activity', async () => {
  for (const status of [404, 405, 401, 503, 'FETCH_ERROR', 'CUSTOM_ERROR']) {
    const app = coordinator(); app.summary = { ...app.summary, isError: true, error: { status } };
    app.render(); app.render(); await flush();
    const legacy = [404, 405].includes(status);
    assert.equal(app.poll.at(-1).skip, legacy);
    assert.equal(app.fallback.at(-1).skip, !legacy);
    assert.deepEqual(app.reads, []);
    app.active = false; app.render(); assert.ok(app.fallback.slice(-3).every(options => options.skip));
    app.hooks.unmount();
  }
});

test('a pre-snapshot pending list read is awaited; backgrounding never starts its queued replacement', async () => {
  const app = coordinator(), task = deferred();
  app.running = task.promise;
  app.summary = { ...app.summary, currentData: snapshot({ bookings: revision('b', 1) }) };
  app.render(); await flush(); assert.equal(app.reads.length, 0);
  app.active = false; app.render(); task.resolve(); await flush(); assert.equal(app.reads.length, 0);
  app.running = undefined; app.active = true; app.render(); await flush(); assert.deepEqual(app.reads, ['bookings']);
  app.hooks.unmount();
});

test('global selectors ignore fetch-only transitions while retaining business updates', () => {
  const options = loader()('features/activity/activityQueryOptions.ts');
  const data = [{ id: 'a' }];
  for (const option of Object.values(options)) {
    assert.equal(option.pollingInterval, 0); assert.equal(option.refetchOnFocus, false);
    const initial = { data, isSuccess: true, isLoading: false, isFetching: false, fulfilledTimeStamp: 1 };
    assert.deepEqual(option.selectFromResult(initial), option.selectFromResult({ ...initial, isFetching: true, fulfilledTimeStamp: 2 }));
    assert.notDeepEqual(option.selectFromResult(initial), option.selectFromResult({ ...initial, data: [] }));
  }
});
