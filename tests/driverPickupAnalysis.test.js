const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const point = (lat, lng = 15.3) => ({ latitude: lat, longitude: lng });
const pickup = point(-4.32);
const route = [point(-4.35), pickup, point(-4.30)];

function fixture() {
  const hooks = hookHarness();
  const load = loader({ react: hooks.react, 'react-native': { Platform: { OS: 'ios' } } });
  const { useDriverNavigationRefs } = load('hooks/driver-navigation/useDriverNavigationRefs.ts');
  const { useDriverNavigationDestination } = load('hooks/driver-navigation/useDriverNavigationDestination.ts');
  const booking = { id: 'booking', status: 'accepted', pickedUp: false };
  const waypoint = { id: 'pickup', type: 'pickup', completed: false, booking,
    location: { lat: pickup.latitude, lng: pickup.longitude }, passenger: { name: 'Passager' } };
  const ref = current => ({ current });
  const calls = { confirmation: [], skipped: [], notices: [], countdowns: [] };
  const state = { steps: [], currentStepIndex: 0, waypoints: [waypoint], currentWaypointIndex: 0,
    waypointModalVisible: false, routeCoordinates: route, pickupNotice: null, pickupBypassConfirmation: null,
    tripEndNotice: null, skippedPickupBookingIds: new Set(), pickupNoticeRef: ref(null),
    pickupBypassConfirmationRef: ref(null), tripEndNoticeRef: ref(null),
    setPickupBypassConfirmation: value => { calls.confirmation.push(value); state.pickupBypassConfirmation = value; },
    setPickupNotice: value => calls.notices.push(value), setPickupNoticeCountdown: value => calls.countdowns.push(value),
  };
  const data = { tripId: 'trip', isKinshasaNavigationTrip: true, tripArrivalCoordinate: point(-4.30) };
  let refs;
  const render = () => hooks.render(() => {
    refs = useDriverNavigationRefs({ trip: { id: data.tripId, status: 'ongoing' } });
    return useDriverNavigationDestination({ refs, mapState: state, data,
      passengers: { visibleBookings: [booking], setPickupSkipped: (...args) => calls.skipped.push(args) } });
  });
  render();
  return { state, data, waypoint, booking, calls, refs, render, hooks, load,
    evaluate: (coordinate, heading = null) => refs.evaluatePickupBypassRef.current(coordinate, heading) };
}

test('bypass skips all geometry without an eligible active pickup, or before approach/exit gates', () => {
  for (const kind of ['none', 'dropoff', 'picked-up', 'dropped-off', 'skipped', 'presented', 'confirmation']) {
    const app = fixture();
    if (kind === 'none') app.state.waypoints = [];
    if (kind === 'dropoff') app.waypoint.type = 'dropoff';
    if (kind === 'picked-up') app.booking.pickedUp = true;
    if (kind === 'dropped-off') app.booking.droppedOff = true;
    if (kind === 'skipped') app.state.skippedPickupBookingIds.add('booking');
    if (kind === 'presented') app.refs.presentedPickupBypassBookingIdsRef.current.add('booking');
    if (kind === 'confirmation') app.state.pickupBypassConfirmation = {};
    app.render();
    for (const coordinate of [point(-4.33), pickup, point(-4.317)]) app.evaluate(coordinate);
    assert.equal(app.refs.routeAnalysis.getStats().queries, 0, kind);
    assert.equal(app.calls.confirmation.length, 0, kind);
    app.hooks.unmount();
  }
  const app = fixture();
  app.evaluate(point(-4.33)); // Not yet within 90 metres.
  app.evaluate(pickup); // Observed, but not yet 160 metres away.
  app.evaluate(point(-4.319));
  assert.equal(app.refs.routeAnalysis.getStats().queries, 0);
  assert.equal(app.refs.pickupClosestDistanceMetersRef.current.get('booking'), 0);
  app.hooks.unmount();
});

test('passing pickup retains confirmation content, skip/reset effects, and never repeats a prompt', () => {
  const app = fixture();
  app.state.pickupNotice = { waypoint: app.waypoint }; app.render();
  app.refs.routeFetchedRef.current = true;
  app.refs.routeSignatureRef.current = 'old';
  app.refs.offRouteSampleCountRef.current = 2;
  app.refs.lastOffRouteRerouteAtRef.current = 123;
  app.evaluate(pickup);
  app.evaluate(point(-4.317), 0);
  assert.equal(app.calls.confirmation.length, 1);
  const confirmation = app.calls.confirmation[0];
  assert.equal(confirmation.waypoint, app.waypoint);
  assert.equal(confirmation.distanceMeters, 334);
  assert.equal(confirmation.closestDistanceMeters, 0);
  assert.equal(confirmation.hasPassedPickupOnRoute, true);
  assert.equal(confirmation.isPickupBehindDriver, true);
  assert.deepEqual(app.calls.skipped, [['booking', true]]);
  assert.deepEqual(app.calls.notices, [null]);
  assert.deepEqual(app.calls.countdowns, [null]);
  assert.equal(app.refs.routeFetchedRef.current, false);
  assert.equal(app.refs.routeSignatureRef.current, '');
  assert.equal(app.refs.offRouteSampleCountRef.current, 0);
  assert.equal(app.refs.lastOffRouteRerouteAtRef.current, 0);
  app.evaluate(point(-4.315), 0);
  assert.equal(app.calls.confirmation.length, 1);
  app.hooks.unmount();
});

test('fixed pickup analysis stays cached while new driver fixes retain exhaustive progress results', () => {
  const app = fixture();
  app.evaluate(pickup);
  // Reversing away from pickup does not count as having passed it; no heading fallback.
  for (let i = 0; i < 100; i++) app.evaluate(point(-4.323 - i * 0.00001));
  const stats = app.refs.routeAnalysis.getStats();
  assert.equal(stats.builds, 1);
  assert.equal(stats.queries, 101, '100 driver projections and one fixed pickup projection');
  assert.equal(stats.cacheHits, 99);
  assert.equal(stats.retainedResults, 2);
  assert.equal(app.calls.confirmation.length, 0);
  app.state.routeCoordinates = [...route].reverse(); app.render();
  app.evaluate(point(-4.324));
  assert.equal(app.refs.routeAnalysis.getStats().builds, 2);
  assert.equal(app.calls.confirmation.length, 1, 'new route direction must not reuse old progress');
  app.hooks.unmount();
});

test('without a usable route the existing GPS-heading fallback still detects bypass', () => {
  const app = fixture(); app.state.routeCoordinates = []; app.render();
  app.evaluate(pickup, 0);
  app.evaluate(point(-4.317), 0);
  assert.equal(app.calls.confirmation.length, 1);
  assert.equal(app.calls.confirmation[0].hasPassedPickupOnRoute, false);
  assert.equal(app.calls.confirmation[0].isPickupBehindDriver, true);
  app.hooks.unmount();
});
