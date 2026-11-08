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

test('the regular detail selects only a sole compatible vehicle and preserves an explicit fleet choice', t => {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const { useRequestAvailability } = loader({ react: hooks.react,
    '@/utils/routeApi': { getRouteCoordinates: () => assert.fail('Vehicle selection must not request a route') },
  })('hooks/request-detail/useRequestAvailability.ts');
  const noop = () => {};
  const first = { id: 'first', isActive: true }, second = { id: 'second', isActive: true }, third = { id: 'third', isActive: true };
  const props = { loadRoute: false, currentUser: { id: 'driver' }, isDriverAccount: true, isIdentityVerified: true,
    tripRequest: { id: 'request', passengerId: 'passenger', status: 'pending', offers: [],
      departureDateMin: '2099-01-01T10:00:00Z', departureDateMax: '2099-01-01T11:00:00Z' },
    directAcceptVehicleId: '', compatibleActiveVehicles: [first], setDirectAcceptRequiresPassengerKyc: noop,
    setDirectAcceptVehicleId: update => { props.directAcceptVehicleId = update(props.directAcceptVehicleId); },
    setIsLoadingRoute: noop, setRouteCoordinates: noop, setShowDirectAcceptModal: noop };
  const render = () => hooks.render(() => useRequestAvailability(props));
  render(); assert.equal(render().directAcceptVehicle, first, 'one compatible vehicle is automatically selected');
  props.compatibleActiveVehicles = [first, second];
  render(); assert.equal(render().directAcceptVehicle, first, 'keep the driver’s existing compatible choice');
  props.directAcceptVehicleId = ''; props.compatibleActiveVehicles = [first, second];
  render(); assert.equal(render().directAcceptVehicle, null, 'a fleet requires an explicit choice');
  props.directAcceptVehicleId = 'second';
  assert.equal(render().directAcceptVehicle, second);
  props.compatibleActiveVehicles = [first, third];
  render(); assert.equal(render().directAcceptVehicle, null, 'a removed vehicle cannot be accepted');
  props.compatibleActiveVehicles = [];
  render(); assert.equal(render().canAcceptDirectly, false);
});
