const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-11-06T12:00:00Z');
const detail = () => ({ id: id(1), passengerId: id(2), selectedDriverId: id(3), status: 'driver_selected',
  offers: [{ id: id(4), tripRequestId: id(1), driverId: id(3), status: 'accepted', acceptedAt: new Date(now - 10000).toISOString() }] });

test('acceptance targets the driver, opens the parent request and deduplicates REST/socket/push', t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const h = hookHarness(); t.after(() => h.unmount());
  const load = loader({ react: h.react }), session = load('services/rideAlertSession.ts');
  const hook = load('hooks/request-detail/usePassengerOfferNotice.ts').usePassengerOfferNotice;
  const render = (data, user = id(3)) => h.render(() => hook(data, user, true, now));
  render(detail(), id(2)); assert.deepEqual(session.pendingRideResponseNotices(id(2)), []);
  render(detail());
  const [alert] = session.pendingRideResponseNotices(id(3));
  assert.equal(alert.recipientId, id(3)); assert.equal(alert.kind, 'response');
  assert.match(load('features/notifications/passengerResponseNotice.ts').passengerResponseNotice(alert).title, /passager a accepté votre prix/);
  assert.deepEqual(load('utils/notificationNavigation.ts').getNotificationHref(alert.data, { id: id(3), role: 'driver' }),
    { pathname: '/request-details/[id]', params: { id: id(1) } });
  const parsed = load('features/notifications/rideAlert.ts').parseRideAlert(alert.data);
  const realtime = load('features/notifications/rideRealtime.ts').parseRideRealtimeEvent;
  assert.ok(realtime({ kind: 'incoming', eventId: id(5), recipientId: id(3), data: alert.data }));
  assert.equal(realtime({ kind: 'incoming', eventId: id(5), recipientId: id(2), data: alert.data }), null);
  session.rememberRideAlert(parsed); render(detail());
  assert.equal(session.pendingRideResponseNotices(id(3)).length, 1);
  session.dismissRideResponseNotice(alert); render(detail()); session.rememberRideAlert(parsed);
  assert.deepEqual(session.pendingRideResponseNotices(id(3)), []);
});

test('late REST restores the recent acceptance notice without replaying its old sound', t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const load = loader(), data = detail(); data.offers[0].acceptedAt = new Date(now - 70000).toISOString();
  const alert = load('features/request-detail/driverOfferAcceptanceAlert.ts').driverOfferAcceptanceAlert(data, id(3));
  const session = load('services/rideAlertSession.ts'); session.rememberRideAlert(alert);
  assert.deepEqual(session.pendingRideAlerts(id(3)), []);
  assert.equal(session.pendingRideResponseNotices(id(3)).length, 1);
});

test('REST does not invent an acceptance for closed, old, pending, or foreign requests', t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const { driverOfferAcceptanceAlert: read } = loader()('features/request-detail/driverOfferAcceptanceAlert.ts');
  for (const data of [{ ...detail(), selectedDriverId: id(9) }, { ...detail(), status: 'cancelled' },
    { ...detail(), offers: [{ ...detail().offers[0], status: 'pending' }] },
    { ...detail(), offers: [{ ...detail().offers[0], acceptedAt: new Date(now - 180001).toISOString() }] },
    { ...detail(), offers: [{ ...detail().offers[0], tripRequestId: id(9) }] }]) assert.equal(read(data, id(3)), null);
});
