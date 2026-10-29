const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const user = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
function fixture() {
  const io = { version: 1, account: user, fail: false, received: true, sent: [], resets: 0 };
  const load = loader({ 'react-native': { NativeModules: {} },
    './tokenSession': { getTokenSessionVersion: () => io.version },
    '@/store': { store: { getState: () => ({ auth: { user: io.account ? { id: io.account } : null } }),
      dispatch: args => { io.sent.push(args); return { unwrap: async () => {
        if (io.fail) throw { status: 'FETCH_ERROR' }; return { received: io.received };
      }, abort() {}, reset() { io.resets++; } }; } } },
    '@/store/api/driverDispatchApi': { driverDispatchApi: { endpoints: { recordRideNotificationReceipt: { initiate: args => args } } } },
  });
  return { io, api: load('services/rideNotificationReceipt.ts') };
}
const payload = { driverId: user, notificationId: id };

for (const failure of ['network', 'received:false']) test(`receipt retries ${failure} without replaying the alert`, async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { api, io } = fixture(); io.fail = failure === 'network'; io.received = failure !== 'received:false';
  await api.reportRideNotificationReceipt(payload, 'displayed'); const observed = io.sent[0].observedAt;
  t.mock.timers.tick(16000); io.fail = false; io.received = true;
  await api.flushNativeRideReceipts(user);
  assert.equal(io.sent.length, 2); assert.equal(io.sent[1].observedAt, observed);
  assert.equal(io.sent[1].stage, 'displayed'); assert.equal(io.resets, 2);
  await api.flushNativeRideReceipts(user); assert.equal(io.sent.length, 2);
});

test('receipt received before profile hydration is uploaded after the account becomes available', async () => {
  const { api, io } = fixture(); io.account = null;
  await api.reportRideNotificationReceipt(payload, 'received'); assert.equal(io.sent.length, 0);
  io.account = user; await api.flushNativeRideReceipts(user); assert.equal(io.sent.length, 1);
});

test('queued receipts never cross an account/session boundary', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { api, io } = fixture(); io.fail = true;
  await api.reportRideNotificationReceipt(payload, 'received');
  io.version++; io.fail = false; t.mock.timers.tick(16000);
  await api.flushNativeRideReceipts(user); assert.equal(io.sent.length, 1);
});

test('pending JS telemetry expires instead of producing an unbounded background queue', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { api, io } = fixture(); io.fail = true;
  await api.reportRideNotificationReceipt(payload, 'received');
  t.mock.timers.tick(16 * 60_000); io.fail = false;
  await api.flushNativeRideReceipts(user); assert.equal(io.sent.length, 1);
});
