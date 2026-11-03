const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const user = '00000000-0000-4000-8000-000000000001';
const request = '00000000-0000-4000-8000-000000000002';

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const io = { state: 'active', version: 0, checks: 0, dismissed: 0, network: async () => ({ allowed: true }) };
  let session;
  const load = loader({
    'react-native': { AppState: { get currentState() { return io.state; } } },
    '@/store': { store: { dispatch: () => { io.checks++; return { unwrap: () => io.network(), abort() {}, reset() {} }; } } },
    '@/store/api/rideRingApi': { rideRingApi: { endpoints: { validateRideRing: { initiate: () => ({}) } } } },
    './tokenSession': { getTokenSessionVersion: () => io.version },
    '@/services/driverNotifications': { dismissDriverInvitation: async () => {
      io.dismissed++; session.acknowledgeRideAlerts(() => true);
    } },
    './rideAudioDiagnostics': { boundedRideAudio: value => value, reportRideAudioFailure: () => assert.fail('unexpected manager failure') },
  });
  session = load('services/rideAlertSession.ts');
  const manager = load('services/rideAlertRevalidation.ts');
  const data = { type: 'trip_request_nearby', driverId: user, tripRequestId: request,
    ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3', ringUntil: new Date(Date.now() + 40000).toISOString(), ringValidationToken: 'test-permit' };
  const alert = load('features/notifications/rideAlert.ts').parseRideAlert(data);
  assert.ok(alert); session.rememberRideAlert(alert);
  t.after(() => { manager.cancelRideAlertRevalidation(user); session.clearRideAlertSession(); });
  return { io, session, alert, ...manager };
}

test('offline entry and reconnect share bounded retries; a recovered check resumes without acknowledging the invitation', async t => {
  const f = fixture(t); f.io.network = async () => { throw Error('offline'); };
  const work = f.revalidatePendingRideAlerts(user);
  assert.equal(f.revalidatePendingRideAlerts(user), work);
  assert.equal(f.session.pendingRideAlerts(user).length, 0, 'pause before any async check');
  assert.equal(f.session.pendingRideEntryAlerts(user).length, 1);
  await tick(); assert.equal(f.io.checks, 1); assert.equal(f.io.dismissed, 0);
  f.io.network = async () => ({ allowed: true }); t.mock.timers.tick(3000); await work;
  assert.equal(f.io.checks, 2); assert.equal(f.io.dismissed, 0);
  assert.equal(f.session.pendingRideAlerts(user).length, 1);
});

test('three failed checks stop retrying, preserve navigation and allow a later reconnect', async t => {
  const f = fixture(t); f.io.network = async () => { throw Error('offline'); };
  const work = f.revalidatePendingRideAlerts(user); await tick();
  t.mock.timers.tick(3000); await tick(); t.mock.timers.tick(6000); await work;
  assert.equal(f.io.checks, 3); assert.equal(f.io.dismissed, 0);
  assert.equal(f.session.pendingRideEntryAlerts(user).length, 1);
  assert.equal(f.session.pendingRideAlerts(user).length, 0);
  f.io.network = async () => ({ allowed: true }); await f.revalidatePendingRideAlerts(user);
  assert.equal(f.session.pendingRideAlerts(user).length, 1);
});

test('only an explicit server denial dismisses and acknowledges the driver invitation', async t => {
  const f = fixture(t); f.io.network = async () => ({ allowed: false });
  await f.revalidatePendingRideAlerts(user);
  assert.equal(f.io.dismissed, 1); assert.equal(f.session.pendingRideEntryAlerts(user).length, 0);
  f.session.rememberRideAlert(f.alert); assert.equal(f.session.pendingRideAlerts(user).length, 0);
});

test('a REST permit repairs a legacy alert without extending its deadline or bypassing validation', async t => {
  const f = fixture(t);
  f.session.clearRideAlertSession();
  const legacy = { ...f.alert, data: { ...f.alert.data, ringValidationToken: undefined } };
  f.session.rememberRideAlert(legacy);
  const work = f.revalidatePendingRideAlerts(user); await tick();
  assert.equal(f.io.checks, 0); assert.equal(f.io.dismissed, 0);
  f.session.rememberRideAlert({ ...f.alert, data: { ...f.alert.data, ringUntil: new Date(Date.now() + 90000).toISOString() } }, true);
  assert.equal(f.session.pendingRideAlerts(user).length, 0, 'receiving a token is not a positive verdict');
  assert.equal(f.session.pendingRideEntryAlerts(user)[0].data.ringUntil, legacy.data.ringUntil);
  t.mock.timers.tick(3000); await work;
  assert.equal(f.io.checks, 1); assert.equal(f.session.pendingRideAlerts(user).length, 1);
});

test('an expired sound remains a silent entry and never makes an HTTP check', async t => {
  const f = fixture(t); t.mock.timers.tick(40001);
  await f.revalidatePendingRideAlerts(user);
  assert.equal(f.io.checks, 0); assert.equal(f.io.dismissed, 0);
  assert.equal(f.session.pendingRideEntryAlerts(user).length, 1);
  assert.equal(f.session.pendingRideAlerts(user).length, 0);
});

test('background cancellation and account change prevent late validations from resuming audio', async t => {
  const f = fixture(t); let finish;
  f.io.network = () => new Promise(resolve => { finish = resolve; });
  const work = f.revalidatePendingRideAlerts(user); await tick();
  f.io.state = 'background'; f.cancelRideAlertRevalidation(user);
  finish({ allowed: true }); await work;
  assert.equal(f.session.pendingRideAlerts(user).length, 0);
  await f.revalidatePendingRideAlerts(user); assert.equal(f.io.checks, 1);
  f.io.state = 'active'; const next = f.revalidatePendingRideAlerts(user); await tick();
  f.io.version++; finish({ allowed: false }); await next;
  assert.equal(f.io.dismissed, 0); assert.equal(f.session.pendingRideEntryAlerts(user).length, 0);
});
