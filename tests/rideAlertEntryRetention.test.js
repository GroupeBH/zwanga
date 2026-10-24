const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const driverId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const data = () => ({ type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3',
  driverId, tripRequestId: id, ringUntil: new Date(Date.now() - 1000).toISOString() });

function fixture() {
  let version = 1;
  const load = loader({ './tokenSession': { getTokenSessionVersion: () => version } });
  const session = load('services/rideAlertSession.ts');
  const { parseRideAlert } = load('features/notifications/rideAlert.ts');
  session.setRideAlertScreen(driverId, '/');
  return { ...session, parse: parseRideAlert, sessionChange: () => version++ };
}

test('a retained nearby card outlives its sound window for routing only, without ringing or speaking again', () => {
  const f = fixture(), alert = f.parse(data());
  f.rememberRideAlert(alert, true);
  assert.deepEqual(f.pendingRideAlerts(driverId), []);
  assert.deepEqual(f.pendingRideEntryAlerts(driverId), [alert]);
  const revision = f.getRideAlertsRevision();
  f.rememberRideAlert(alert, true);
  assert.equal(f.getRideAlertsRevision(), revision, 'duplicate native/Expo reads do not trigger another redirect');
  const { selectRequestAlert } = loader()('features/navigation/priorityRequestEntry.ts');
  assert.equal(selectRequestAlert(f.pendingRideEntryAlerts(driverId), driverId, new Set()).id, id);
});

test('non-restored late delivery does not silently enqueue a request; fresh rings keep first priority', () => {
  const f = fixture(), old = f.parse(data());
  f.rememberRideAlert(old); assert.deepEqual(f.pendingRideEntryAlerts(driverId), []);
  f.rememberRideAlert(old, true);
  const fresh = f.parse({ ...data(), tripRequestId: driverId, ringUntil: new Date(Date.now() + 30000).toISOString() });
  f.rememberRideAlert(fresh);
  assert.deepEqual(f.pendingRideEntryAlerts(driverId), [fresh, old]);
  assert.deepEqual(f.pendingRideAlerts(driverId), [fresh]);
});

test('expired business offers, malformed timing, passenger responses, own requests and other accounts do not create entry-only routes', () => {
  const f = fixture();
  const cases = [
    { ...data(), ringUntil: 'invalid' }, { ...data(), alertExpiresAt: new Date(0).toISOString() },
    { ...data(), driverId: id },
    { type: 'driver_dispatch_offer', actionProtocol: 'driver-v1', offerId: id, driverId,
      expiresAt: new Date(0).toISOString(), ringUntil: new Date(0).toISOString() },
    { type: 'booking_response', ringAlert: 'booking-response-v1', bookingId: id, passengerId: driverId,
      status: 'accepted', ringUntil: new Date(0).toISOString() },
  ];
  for (const payload of cases) f.rememberRideAlert(f.parse(payload), true);
  f.rememberRideAlert({ ...f.parse(data()), data: { ...data(), passengerId: driverId } }, true);
  assert.deepEqual(f.pendingRideEntryAlerts(driverId), []);
  assert.deepEqual(f.pendingRideAlerts(driverId), []);
});

test('answer, logout and session replacement clear silent entry candidates too', () => {
  for (const clear of ['acknowledge', 'logout', 'session']) {
    const f = fixture(), alert = f.parse(data()); f.rememberRideAlert(alert, true);
    if (clear === 'acknowledge') {
      f.acknowledgeRideAlerts(a => a.key === alert.key);
      f.rememberRideAlert(alert, true);
    } else if (clear === 'logout') f.clearRideAlertSession();
    else f.sessionChange();
    assert.deepEqual(f.pendingRideEntryAlerts(driverId), [], clear);
  }
});

test('silent entry candidates are bounded and business expiry is still honored', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture();
  for (let i = 1; i <= 60; i++) f.rememberRideAlert(f.parse({ ...data(),
    tripRequestId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    alertExpiresAt: new Date(Date.now() + 1000).toISOString() }), true);
  assert.equal(f.pendingRideEntryAlerts(driverId).length, 50);
  t.mock.timers.tick(1001); assert.deepEqual(f.pendingRideEntryAlerts(driverId), []);
});
