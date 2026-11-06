const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-11-06T12:00:00Z');
const iso = delta => new Date(now + delta).toISOString();
const request = () => ({ id: id(1), passengerId: id(2), status: 'offers_received', departureDateMax: iso(3600000),
  responseWindow: { phase: 'passenger', serverNow: iso(0), expiresAt: iso(110000) },
  offers: [{ id: id(3), tripRequestId: id(1), driverId: id(4), status: 'pending', pricePerSeat: 1500, createdAt: iso(-10000) }] });

test('REST discovers a pending price without push/socket; duplicate reads/transports never replay a dismissed offer', t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const load = loader({ react: hooks.react }), session = load('services/rideAlertSession.ts');
  const useNotice = load('hooks/request-detail/usePassengerOfferNotice.ts').usePassengerOfferNotice;
  const render = (detail, user = id(2), enabled = true) => hooks.render(() => useNotice(detail, user, enabled, now));
  const detail = request();
  render(detail, id(4)); render(detail, id(2), false);
  assert.equal(session.pendingRideResponseNotices(id(2)).length, 0);
  render(detail); render({ ...detail });
  const [alert] = session.pendingRideResponseNotices(id(2));
  assert.ok(alert); assert.equal(session.pendingRideAlerts(id(2)).length, 1);
  assert.match(load('features/notifications/passengerResponseNotice.ts').passengerResponseNotice(alert).message, /1.500 FC par place/);
  const push = load('features/notifications/rideAlert.ts').parseRideAlert(alert.data);
  session.rememberRideAlert(push); assert.equal(session.pendingRideResponseNotices(id(2)).length, 1);
  session.dismissRideResponseNotice(alert); render({ ...detail }); session.rememberRideAlert(push);
  assert.deepEqual(session.pendingRideResponseNotices(id(2)), []);
  assert.deepEqual(session.pendingRideAlerts(id(2)), []);
});

test('late REST restores the decision notice but never restarts an elapsed sound window', t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const load = loader(), session = load('services/rideAlertSession.ts');
  const detail = request(); detail.offers[0].createdAt = iso(-70000);
  const [alert] = load('features/request-detail/passengerOfferAlert.ts').passengerOfferAlerts(detail, id(2), now);
  session.rememberRideAlert(alert);
  assert.deepEqual(session.pendingRideAlerts(id(2)), []);
  assert.equal(session.pendingRideResponseNotices(id(2)).length, 1);
  t.mock.timers.tick(110001);
  assert.deepEqual(session.pendingRideResponseNotices(id(2)), []);
  session.rememberRideAlert(alert); assert.deepEqual(session.pendingRideResponseNotices(id(2)), []);
});

test('REST excludes foreign, assigned, closed, expired and shared offers; server duration handles clock skew', t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const { passengerOfferAlerts } = loader()('features/request-detail/passengerOfferAlert.ts');
  for (const patch of [{ passengerId: id(9) }, { status: 'cancelled' }, { tripId: id(9) }, { selectedDriverId: id(9) },
    { offers: [{ ...request().offers[0], existingTripId: id(5) }] }, { offers: [{ ...request().offers[0], status: 'rejected' }] },
    { responseWindow: { phase: 'passenger', serverNow: iso(0), expiresAt: iso(-1) } },
    { responseWindow: { ...request().responseWindow, phase: 'accepting' } }])
    assert.deepEqual(passengerOfferAlerts({ ...request(), ...patch }, id(2), now), []);
  const detail = request();
  detail.responseWindow.serverNow = iso(3600000); detail.responseWindow.expiresAt = iso(3650000);
  detail.departureDateMax = iso(7200000); detail.offers[0].createdAt = iso(3590000);
  const [alert] = passengerOfferAlerts(detail, id(2), now);
  assert.equal(alert.expiresAt, iso(50000)); assert.equal(alert.data.alertExpiresAt, iso(50000));
  assert.deepEqual(passengerOfferAlerts(detail, id(2), NaN), []);
});

test('a pre-notification detail cache cannot dismiss the price; only a fresh server read may retire it', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const io = { invalidations: [], read: { currentData: { ...request(), offers: [] }, startedTimeStamp: now - 1000 } };
  const dispatch = tags => io.invalidations.push(tags);
  const load = loader({ react: { ...React, ...hooks.react, useSyncExternalStore: (_, read) => read() },
    'react-native': { View: 'View', ScrollView: 'Scroll', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: value => value } },
    'expo-router': { useRouter: () => ({ push() {} }) },
    '@/hooks/useAppIsActive': { useAppIsActive: () => true },
    '@/hooks/notifications/usePaymentAnnouncement': { useScreenAnnouncement() {} },
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: selector => selector === 'user' ? { id: id(2) } : true },
    '@/store/selectors': { selectUser: 'user', selectIsAuthenticated: 'authenticated' },
    '@/store/api/baseApi': { baseApi: { util: { invalidateTags: tags => tags } } },
    '@/store/api/tripRequestApi': { useGetTripRequestByIdQuery: () => io.read },
    '@/hooks/useDisplayReads': { displayReadOptions: enabled => ({ skip: !enabled }), useDisplayReadsEnabled: enabled => enabled },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
    '@/features/navigation/RideOverlayProvider': { useRideOverlay: () => ({}) },
  });
  const session = load('services/rideAlertSession.ts');
  const [alert] = load('features/request-detail/passengerOfferAlert.ts').passengerOfferAlerts(request(), id(2), now);
  session.rememberRideAlert(alert);
  const render = () => hooks.render(() => load('components/PassengerRideResponseCoordinator.tsx').PassengerRideResponseCoordinator());
  render(); render();
  assert.equal(session.pendingRideResponseNotices(id(2)).length, 1);
  assert.deepEqual(io.invalidations, [[{ type: 'TripRequest', id: id(1) }]]);
  io.read = { currentData: request(), startedTimeStamp: now + 1 }; render();
  assert.equal(session.pendingRideResponseNotices(id(2)).length, 1);
  io.read = { currentData: { ...request(), offers: [] }, startedTimeStamp: now + 2 }; render();
  assert.deepEqual(session.pendingRideResponseNotices(id(2)), []);
});
