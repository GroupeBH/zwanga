const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture(t, result) {
  const calls = [];
  const baseApi = createApi({ reducerPath: 'activityReadTest', tagTypes: ['TripRequest', 'MyTripRequests'],
    baseQuery: async arg => { calls.push(arg); return result(arg); }, endpoints: () => ({}),
  });
  const { tripRequestApi: api } = loader({ './baseApi': { baseApi }, './tripApi': {},
    './trip-request/requestMapper': { mapServerTripRequestToClient: x => x },
  })('store/api/tripRequestApi.ts');
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer },
    middleware: defaults => defaults().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  return { calls, api, store, read: name => store.dispatch(api.endpoints[name].initiate()),
    select: name => api.endpoints[name].select()(store.getState()),
  };
}

test('activity and full history use independent RTK caches and the same owner-scoped server path', async t => {
  const active = { id: 'pending', status: 'pending', offers: [{ id: 'offer', status: 'pending' }] };
  const archived = { id: 'archived', status: 'cancelled' };
  const f = fixture(t, arg => ({ data: typeof arg === 'string' ? [active, archived] : [active] }));
  assert.deepEqual(await f.read('getMyTripRequests').unwrap(), [active, archived]);
  assert.deepEqual(await f.read('getMyActivityRequests').unwrap(), [active]);
  assert.deepEqual(f.calls, ['/trip-requests/my-requests', { url: '/trip-requests/my-requests', params: { scope: 'activity' } }]);
  assert.deepEqual(f.select('getMyTripRequests').data, [active, archived]);
  assert.deepEqual(f.select('getMyActivityRequests').data, [active]);
  assert.deepEqual(await f.read('getMyActivityRequests').unwrap(), [active]);
  assert.equal(f.calls.length, 2, 'entry, home and notifications share the same activity cache');
});

test('old servers ignoring scope remain compatible without hiding older pending requests', async t => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: String(i), status: 'pending' }));
  const f = fixture(t, () => ({ data: rows }));
  assert.deepEqual(await f.read('getMyActivityRequests').unwrap(), rows);
});

test('activity failure is not a successful empty list and does not erase full history', async t => {
  const f = fixture(t, arg => typeof arg === 'string' ? { data: [{ id: 'history' }] } : { error: { status: 503 } });
  await f.read('getMyTripRequests');
  await assert.rejects(f.read('getMyActivityRequests').unwrap(), error => error.status === 503);
  assert.equal(f.select('getMyActivityRequests').isError, true);
  assert.equal(f.select('getMyActivityRequests').data, undefined);
  assert.deepEqual(f.select('getMyTripRequests').data, [{ id: 'history' }]);
});
