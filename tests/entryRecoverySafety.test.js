const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi, fetchBaseQuery } = require('@reduxjs/toolkit/query');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const logs = [];
  const api = loader({}, { console: { warn: (...args) => logs.push(args) } })('services/entryRecovery.ts');
  return { ...api, logs };
}

test('an aborted waiter cannot cancel another consumer or launch a late read', async t => {
  const f = fixture(t), running = deferred(), controller = new AbortController(); let started = 0;
  const promise = f.readEntryQuery({ stage: 'trip-detail', signal: controller.signal, current: () => true,
    running: () => running.promise, start: () => { started++; return { unwrap: async () => 'unexpected' }; } });
  const rejected = assert.rejects(promise, /CANCELLED/);
  controller.abort(); await rejected; running.resolve(); await flush();
  assert.equal(started, 0); assert.deepEqual(f.logs, []);
});

test('a stalled GET releases the entry wait at the deadline without aborting the shared cache', async t => {
  const f = fixture(t), wait = deferred(); let aborted = 0;
  const promise = f.readEntryQuery({ stage: 'request-detail', current: () => true,
    start: () => ({ unwrap: () => wait.promise, abort: () => { aborted++; } }) });
  const rejected = assert.rejects(promise, /CANCELLED/);
  t.mock.timers.tick(f.ENTRY_LOAD_TIMEOUT_MS); await rejected; assert.equal(aborted, 0);
  assert.equal(f.logs[0][1], 'request-detail:timeout');
  const result = await f.readEntryQuery({ stage: 'request-detail', current: () => true, start: () => ({ unwrap: async () => 'fresh' }) });
  assert.equal(result, 'fresh'); wait.resolve('late'); await flush();
});

test('successful reads release timers and session changes prevent a queued GET', async t => {
  const f = fixture(t); let aborted = 0, current = true, started = 0;
  await f.readEntryQuery({ stage: 'profile', current: () => current,
    start: () => ({ unwrap: async () => 'ok', abort: () => { aborted++; } }) });
  t.mock.timers.tick(f.ENTRY_LOAD_TIMEOUT_MS); assert.equal(aborted, 0); assert.deepEqual(f.logs, []);
  const waiting = deferred();
  const promise = f.readEntryQuery({ stage: 'booking-detail', current: () => current, running: () => waiting.promise,
    start: () => { started++; return { unwrap: async () => 'no' }; } });
  const rejected = assert.rejects(promise, /STALE_ENTRY/); current = false; waiting.resolve(); await rejected;
  assert.equal(started, 0);
});

test('a recent detail or a just-completed shared detail does not start a duplicate GET', async t => {
  const f = fixture(t); let started = 0, cached;
  const options = { stage: 'trip-detail', current: () => true, reuse: () => cached,
    start: () => { started++; return { unwrap: async () => 'network' }; } };
  cached = 'recent'; assert.equal(await f.readEntryQuery(options), 'recent');
  assert.equal(started, 0);
  cached = undefined; const running = deferred();
  const waiting = f.readEntryQuery({ ...options, running: () => running.promise });
  cached = 'shared'; running.resolve(); assert.equal(await waiting, 'shared'); assert.equal(started, 0);
  cached = undefined; assert.equal(await f.readEntryQuery(options), 'network'); assert.equal(started, 1);
});

test('diagnostics keep a bounded static code and duration, never raw exception contents', async t => {
  const f = fixture(t);
  for (let i = 0; i < 3; i++) await assert.rejects(f.readEntryQuery({ stage: 'bookings', current: () => true,
    start: () => ({ unwrap: async () => { throw new Error('private fake payload'); } }) }));
  assert.equal(f.logs.length, 1); assert.equal(f.logs[0][1], 'bookings:read');
  assert.equal(JSON.stringify(f.logs).includes('private'), false);
  t.mock.timers.tick(60000); f.reportEntryFailure('bookings', 'read', Date.now() - 250);
  assert.equal(f.logs.length, 2); assert.equal(f.logs[1][2].elapsedMs, 250);
});

test('leaving entry cannot abort a GET subsequently shared by the detail screen (installed RTK)', async t => {
  const { readEntryQuery } = loader()('services/entryRecovery.ts');
  const controller = new AbortController(), response = deferred(); let calls = 0, networkAborts = 0;
  const api = createApi({ reducerPath: 'entryTest',
    baseQuery: async (_arg, { signal }) => {
      calls++;
      signal.addEventListener('abort', () => { networkAborts++; }, { once: true });
      return { data: await response.promise };
    },
    endpoints: build => ({ detail: build.query({ query: id => id }) }),
  });
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer },
    middleware: getDefault => getDefault().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  const entry = readEntryQuery({ stage: 'request-detail', current: () => true, signal: controller.signal,
    start: () => store.dispatch(api.endpoints.detail.initiate('request', { subscribe: false, forceRefetch: true })) });
  const rejected = assert.rejects(entry, /CANCELLED/);
  const screen = store.dispatch(api.endpoints.detail.initiate('request'));
  controller.abort(); await rejected;
  response.resolve({ status: 'pending' });
  const result = await screen;
  assert.equal(networkAborts, 0, 'the shared cache read belongs to both consumers');
  assert.equal(calls, 1, 'no duplicate GET');
  assert.equal(result.isSuccess, true);
  assert.deepEqual(result.data, { status: 'pending' });
  screen.unsubscribe();
});

test('diagnostics classify network failures without printing response bodies or error messages', t => {
  const f = fixture(t);
  const examples = [
    [{ status: 'TIMEOUT_ERROR', error: 'private' }, { failure: 'timeout' }],
    [{ status: 'FETCH_ERROR', error: 'AbortError: Aborted' }, { failure: 'aborted' }],
    [{ name: 'AbortError', message: 'private' }, { failure: 'aborted' }],
    [{ status: 'FETCH_ERROR', error: 'private network details' }, { failure: 'network' }],
    [{ status: 503, data: { private: 'not for logs' } }, { failure: 'http', httpStatus: 503 }],
    [{ status: 'CUSTOM_ERROR', error: 'private' }, { failure: 'invalid-response' }],
    [{ status: 'PARSING_ERROR', data: 'private' }, { failure: 'invalid-response' }],
    [{ status: 'private', error: 'private' }, { failure: 'unknown' }],
  ];
  for (const [error, details] of examples) {
    f.reportEntryFailure('activity', 'read', Date.now() - 20070, error);
    assert.deepEqual(f.logs.at(-1)[2], { elapsedMs: 20070, ...details });
    t.mock.timers.tick(60000);
  }
  assert.equal(JSON.stringify(f.logs).includes('private'), false);
});

test('installed RTK can return FETCH_ERROR/AbortError for a native fetch timeout, not only for entry cancellation', async t => {
  const f = fixture(t);
  const { DEFAULT_API_TIMEOUT_MS } = loader()('constants/network.ts');
  const requestStarted = deferred();
  const controller = new AbortController(); let nativeAborts = 0;
  const query = fetchBaseQuery({ baseUrl: 'https://example.invalid', timeout: DEFAULT_API_TIMEOUT_MS,
    // Model native fetch rejecting with AbortError instead of forwarding signal.reason.
    fetchFn: request => new Promise((_resolve, reject) => {
      request.signal.addEventListener('abort', () => {
        nativeAborts++;
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      }, { once: true });
      requestStarted.resolve();
    }),
  });
  const pending = f.readEntryQuery({ stage: 'activity', current: () => true,
    start: () => ({ unwrap: async () => {
      const result = await query('/me/activity', { signal: controller.signal, getState: () => ({}),
        dispatch: () => {}, endpoint: 'activity', type: 'query' }, {});
      if (result.error) throw result.error;
      return result.data;
    } }),
  });
  const rejected = assert.rejects(pending, error => error.status === 'FETCH_ERROR' && error.error === 'AbortError: Aborted');
  // A single setImmediate is not a guarantee that RTK has entered fetch under
  // parallel test load. Advance the fake clock only after its abort listener exists.
  await requestStarted.promise; t.mock.timers.tick(DEFAULT_API_TIMEOUT_MS); await rejected;
  assert.equal(nativeAborts, 1);
  assert.equal(controller.signal.aborted, false, 'the coordinator did not cancel this request');
  assert.deepEqual(f.logs[0][2], { elapsedMs: DEFAULT_API_TIMEOUT_MS, failure: 'aborted' });
  assert.equal(f.logs[0][1], 'activity:read');
});
