const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const id = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const driver = { id, role: 'driver', firstName: 'Conducteur', lastName: 'Test', vehicles: [
  { type: 'car', isActive: true, brand: 'Test', model: 'Voiture' },
  { type: 'motorcycle_2_wheels', isActive: true, brand: 'Test', model: 'Moto' },
] };
const { profileRequestDriver, driverProfileContext } = loader()('features/trip-request/directDriverRequest.ts');
test('a known driver prefills only active compatible public vehicles, never an invented distance', () => {
  assert.equal(profileRequestDriver(driver, 'passenger', 'motorcycle_2_wheels').vehicleType, 'motorcycle_2_wheels');
  assert.equal(profileRequestDriver(driver, 'passenger').distanceKm, null);
  for (const user of [undefined, id]) assert.equal(profileRequestDriver(driver, user), null);
  assert.equal(profileRequestDriver({ ...driver, vehicles: [] }, 'passenger'), null);
  assert.equal(profileRequestDriver({ ...driver, role: 'passenger' }, 'passenger'), null);
});
test('map context must have both a request UUID and a request-scoped opaque marker', () => {
  assert.equal(driverProfileContext(id, undefined).valid, true);
  assert.equal(driverProfileContext('a'.repeat(64), requestId).valid, true);
  for (const [marker, request] of [[id, requestId], ['a'.repeat(64), 'bad'], [[id], undefined]])
    assert.equal(driverProfileContext(marker, request).valid, false);
});
test('prefill waits for the server, blocks silent broadcast on failure and does not reselect after removal', t => {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const query = { isError: false, currentData: undefined, isFetching: false, refetch() {} };
  const choices = [], types = [];
  const draft = { setTargetDriver: value => choices.push(value), setSelectedVehicleTypes: value => types.push(value) };
  const { useDirectDriverPrefill } = loader({ react: hooks.react,
    '@/store/hooks': { useAppSelector: fn => fn({ auth: { user: { id: 'passenger' } } }) },
    '@/store/api/userApi': { useGetPublicUserInfoQuery: () => query },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: x => x, displayReadOptions: x => ({ skip: !x }) },
  })('hooks/trip-request/useDirectDriverPrefill.ts');
  const render = () => hooks.render(() => useDirectDriverPrefill(id, 'motorcycle_2_wheels', true, draft));
  assert.equal(render().blocked, true); query.isError = true;
  assert.equal(render().error, true); assert.equal(choices.length, 0);
  query.isError = false; query.currentData = driver; render();
  assert.equal(render().blocked, false); assert.equal(choices[0].id, id); assert.deepEqual(types[0], ['motorcycle_2_wheels']);
  render().dismiss(); render(); assert.deepEqual(choices.map(value => value?.id ?? null), [id, null]);
});
