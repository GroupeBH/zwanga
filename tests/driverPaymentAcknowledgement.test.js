const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('@reduxjs/toolkit/query');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const flush = async () => { for (let i = 0; i < 12; i++) await tick(); };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const receipt = { notificationId: id(1), driverId: 'driver', role: 'driver', tripId: id(2), bookingId: id(3),
  type: 'driver_booking_payment_confirmed', amount: 800, currency: 'CDF', paymentMode: 'points' };

async function integration(t) {
  const server = { fail: true, stale: false, rows: [receipt], gets: 0, puts: 0 };
  const state = { now: 100_000, active: true, online: true };
  t.mock.method(Date, 'now', () => state.now);
  const baseApi = createApi({ reducerPath: 'paymentAudit', tagTypes: ['Notification'], endpoints: () => ({}),
    baseQuery: async arg => {
      const request = typeof arg === 'string' ? { url: arg } : arg;
      if (request.url === '/notifications/driver-payments') {
        server.gets++;
        return { data: { userId: 'driver', notices: structuredClone(server.rows) } };
      }
      assert.equal(request.url, '/notifications/mark-as-read');
      assert.equal(request.method, 'PUT');
      assert.deepEqual(request.body.notificationIds, [receipt.notificationId]);
      server.puts++;
      if (server.fail) return { error: { status: 503, data: 'unavailable' } };
      if (!server.stale) server.rows = [];
      return { data: { updated: 1 } };
    } });
  const apiLoader = loader({ './baseApi': { baseApi } });
  apiLoader('store/api/driverPaymentApi.ts'); apiLoader('store/api/notificationApi.ts');
  const store = configureStore({ reducer: { paymentAudit: baseApi.reducer },
    middleware: defaults => defaults().concat(baseApi.middleware), enhancers: defaults => defaults({ autoBatch: false }) });
  const endpoint = baseApi.endpoints.getDriverPaymentNotices;
  const handle = store.dispatch(endpoint.initiate('driver'));
  await handle.unwrap();
  const hooks = hookHarness(), seen = { [`booking-payment:${id(3)}`]: '2026-10-29' };
  const ack = payload => store.dispatch(baseApi.endpoints.markNotificationsAsRead.initiate(payload));
  const hook = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useAppIsActive: () => state.active },
    '@/store/hooks': { useAppSelector: () => state.online },
    './useRideSocketConnected': { useRideSocketConnected: () => false },
    '@/store/api/driverPaymentApi': { useGetDriverPaymentNoticesQuery: () => {
      const read = endpoint.select('driver')(store.getState()); return { ...read, currentData: read.data };
    } },
    '@/store/api/notificationApi': { useMarkNotificationsAsReadMutation: () => [ack] },
  })('hooks/notifications/useDriverPaymentInbox.ts').useDriverPaymentInbox;
  let disposed = false, scheduled = false;
  const render = () => hooks.render(() => hook('driver', true, seen));
  const unsubscribe = store.subscribe(() => {
    if (scheduled || disposed) return;
    scheduled = true;
    setImmediate(() => { scheduled = false; if (!disposed) render(); });
  });
  t.after(() => { disposed = true; unsubscribe(); hooks.unmount(); handle.unsubscribe(); store.dispatch(baseApi.util.resetApiState()); });
  const refresh = async () => {
    await store.dispatch(endpoint.initiate('driver', { subscribe: false, forceRefetch: true })); await flush();
  };
  return { state, server, render, refresh, store, baseApi };
}

test('real RTK + receipt hook: failed acknowledgement cannot cause a self-sustaining GET/PUT loop', async t => {
  const f = await integration(t);
  f.render(); await flush();
  assert.equal(f.server.puts, 1); assert.equal(f.server.gets, 1, '503 never invalidates the feed');
  for (let i = 0; i < 10; i++) {
    f.state.now++;
    f.store.dispatch(f.baseApi.util.invalidateTags([{ type: 'Notification', id: 'DRIVER_PAYMENTS' }])); await flush();
  }
  assert.equal(f.server.puts, 1, 'even socket hints cannot bypass the retry delay');
  f.state.now = 115_000; await f.refresh(); assert.equal(f.server.puts, 2);
  f.state.now = 144_999; await f.refresh(); assert.equal(f.server.puts, 2);
  f.state.now = 145_000; f.server.fail = false; await f.refresh();
  assert.equal(f.server.puts, 3); assert.deepEqual(f.render().notices, []);
});

test('successful acknowledgement with a stale replica is paced instead of looping', async t => {
  const f = await integration(t); f.server.fail = false; f.server.stale = true;
  f.render(); await flush();
  assert.equal(f.server.puts, 1); assert.equal(f.server.gets, 2, 'one confirmed invalidation');
  f.state.now += 14_999; await f.refresh(); assert.equal(f.server.puts, 1);
  f.state.now++; await f.refresh(); assert.equal(f.server.puts, 2);
  f.state.now += 15_000; f.server.stale = false; await f.refresh();
  assert.equal(f.server.puts, 3); assert.deepEqual(f.render().notices, []);
});

test('retries back off to five minutes and pause offline or in the background', async t => {
  const f = await integration(t); f.render(); await flush();
  for (const [index, delay] of [15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000].entries()) {
    f.state.now += delay - 1; await f.refresh(); assert.equal(f.server.puts, index + 1);
    f.state.now++; await f.refresh(); assert.equal(f.server.puts, index + 2);
  }
  f.state.active = false; f.state.now += 300_000; f.render(); await f.refresh(); assert.equal(f.server.puts, 8);
  f.state.active = true; f.state.online = false; f.render(); await f.refresh(); assert.equal(f.server.puts, 8);
  f.state.online = true; f.render(); await flush(); assert.equal(f.server.puts, 9);
});

test('an old account completion cannot unlock a newer acknowledgement; unmount adds no timer', async () => {
  const hooks = hookHarness(); let owner = 'first', session = 1, calls = 0;
  const completions = [];
  const notice = { key: 'seen', notificationId: id(1) }, seen = { seen: '2026-10-29' };
  let read = { currentData: [notice], fulfilledTimeStamp: 1 };
  const ack = () => { calls++; return { unwrap: () => new Promise(resolve => completions.push(resolve)) }; };
  const hook = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useAppIsActive: () => true }, '@/store/hooks': { useAppSelector: () => true },
    '@/services/tokenSession': { getTokenSessionVersion: () => session },
    './useRideSocketConnected': { useRideSocketConnected: () => true },
    '@/store/api/driverPaymentApi': { useGetDriverPaymentNoticesQuery: () => read },
    '@/store/api/notificationApi': { useMarkNotificationsAsReadMutation: () => [ack] },
  })('hooks/notifications/useDriverPaymentInbox.ts').useDriverPaymentInbox;
  const render = () => hooks.render(() => hook(owner, true, seen));
  render(); owner = 'second'; session++; render(); assert.equal(calls, 2);
  completions[0](); await flush(); read = { ...read, fulfilledTimeStamp: 2 }; render(); assert.equal(calls, 2);
  hooks.unmount(); completions[1](); await flush(); assert.equal(calls, 2);
});
