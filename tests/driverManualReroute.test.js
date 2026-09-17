const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function setup() {
  const hooks = hookHarness();
  const calls = [];
  const coordinate = { latitude: -4.3, longitude: 15.2 };
  const foundation = {
    data: { isScreenActive: true, isTripOngoing: true, tripId: 'trip', trip: { status: 'ongoing' } },
    mapState: { isMountedRef: { current: true }, isLoadingRoute: false },
    refs: {
      fetchRouteRef: { current: null }, updateCurrentStepRef: { current: null },
      routeSignatureRef: { current: 'active-route' }, routeFetchedRef: { current: true },
      lastRouteFetchTimeRef: { current: 1234 }, routeCoordinatesRef: { current: [coordinate] },
    },
    destination: {}, passengers: {}, exitActions: {},
  };
  const dependencies = {
    useDriverNavigationSession: () => ({ foundation, notices: {}, completion: {} }),
    useDriverRouteContext: () => ({ getFreshDriverCoordinate: () => coordinate }),
    useDriverNavigationRoute: () => ({ fetchRoute: options => { calls.push(options); return Promise.resolve(); } }),
    useDriverPassengerPresentation: () => ({}), useDriverNavigationPresentation: () => ({}),
    useDriverRouteProgressTracking: () => ({}), useDriverNavigationStepProgress: () => ({}),
    useDriverRouteFormatting: () => ({}), useDriverVoiceGuidance: () => ({}),
    useDriverPickupActions: () => ({}), useDriverTripActions: () => ({}),
    useDriverTripInterruptionActions: () => ({}), useDriverNavigationExitPrompt: () => ({}),
    useDriverBookingActions: () => ({}),
  };
  const mocks = { react: hooks.react };
  for (const [name, implementation] of Object.entries(dependencies)) mocks[`./${name}`] = { [name]: implementation };
  const { useDriverNavigationController } = loader(mocks)('hooks/driver-navigation/useDriverNavigationController.ts');
  return { hooks, foundation, coordinate, calls, render: () => hooks.render(useDriverNavigationController) };
}

test('manual rerouting uses the fresh driver position without resetting the active route guards', () => {
  const { hooks, foundation, coordinate, calls, render } = setup();
  const refs = foundation.refs;
  const currentRoute = refs.routeCoordinatesRef.current;
  render().forceRecalculateRoute();
  assert.deepEqual(calls, [{ originOverride: coordinate, announceReroute: true }]);
  assert.equal(refs.routeSignatureRef.current, 'active-route');
  assert.equal(refs.routeFetchedRef.current, true);
  assert.equal(refs.lastRouteFetchTimeRef.current, 1234);
  assert.equal(refs.routeCoordinatesRef.current, currentRoute);
  hooks.unmount();
});

test('manual rerouting is ignored when busy, inactive, paused or unmounted', () => {
  const { hooks, foundation, calls, render } = setup();
  for (const [target, key, blockedValue] of [
    [foundation.data, 'isScreenActive', false],
    [foundation.data, 'isTripOngoing', false],
    [foundation.mapState, 'isLoadingRoute', true],
    [foundation.mapState.isMountedRef, 'current', false],
  ]) {
    const previous = target[key];
    target[key] = blockedValue;
    render().forceRecalculateRoute();
    assert.equal(calls.length, 0, key);
    target[key] = previous;
  }
  hooks.unmount();
});
