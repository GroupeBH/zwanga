const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('scheduled and immediate requests need eligibility, not a received alert, for direct acceptance', t => {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const { useRequestAvailability } = loader({ react: hooks.react,
    '@/utils/routeApi': { getRouteCoordinates: () => { throw new Error('No routing while checking eligibility'); } },
  })('hooks/request-detail/useRequestAvailability.ts');
  const noOp = () => {};
  const base = { loadRoute: false, currentUser: { id: 'driver' }, isDriverAccount: true, isIdentityVerified: true,
    directAcceptVehicleId: 'car', compatibleActiveVehicles: [{ id: 'car', isActive: true }],
    setDirectAcceptRequiresPassengerKyc: noOp, setDirectAcceptVehicleId: noOp, setIsLoadingRoute: noOp,
    setRouteCoordinates: noOp, setShowDirectAcceptModal: noOp };
  const request = { id: 'request', passengerId: 'passenger', status: 'pending',
    departureDateMin: '2099-01-01T10:00:00Z', departureDateMax: '2099-01-01T11:00:00Z', offers: [] };
  for (const immediateDispatch of [false, true]) {
    const render = (patch = {}, requestPatch = {}) => hooks.render(() => useRequestAvailability({ ...base, ...patch,
      tripRequest: { ...request, immediateDispatch, ...requestPatch } }));
    assert.equal(render().canAcceptDirectly, true);
    for (const patch of [{ isIdentityVerified: false }, { isDriverAccount: false }, { compatibleActiveVehicles: [] }])
      assert.equal(render(patch).canAcceptDirectly, false);
    for (const patch of [{ passengerId: 'driver' }, { status: 'cancelled' }, { status: 'driver_selected' },
      { offers: [{ driverId: 'other', status: 'accepted' }] }])
      assert.equal(render({}, patch).canAcceptDirectly, false);
  }
});
