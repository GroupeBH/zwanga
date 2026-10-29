const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const point = { latitude: -4.31, longitude: 15.29, title: 'Ma position actuelle', address: 'Position exacte enregistrée sur la carte' };
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(result) {
  const calls = []; let releases = 0;
  const load = loader({ '@/store': { store: { dispatch: args => {
    calls.push(args); return { unwrap: () => result(args), unsubscribe: () => releases++ };
  } } }, '@/store/api/googleMapsApi': { googleMapsApi: { endpoints: { getRouteLocationAddress: { initiate: args => args } } } } });
  return { ...load('services/sharedRouteAddresses.ts'), calls, releases: () => releases };
}
test('GPS labels are replaced by the actual saved point address, without changing its coordinates', async () => {
  const f = fixture(async () => ({ formattedAddress: 'Avenue des Écoles, Gombe, Kinshasa' }));
  const value = await f.resolveSharedRouteAddresses({ text: 'Ma position', point }, { text: 'Gare Centrale', point: null });
  assert.equal(value.departureAddress, 'Avenue des Écoles, Gombe, Kinshasa');
  assert.equal(value.arrivalAddress, 'Gare Centrale');
  assert.deepEqual(f.calls, [{ lat: -4.31, lng: 15.29, language: 'fr', region: 'cd' }]);
  assert.equal(f.releases(), 1);
  assert.equal(point.title, 'Ma position actuelle');
});
test('a readable address or manual landmark needs no extra network call', async () => {
  const f = fixture(() => assert.fail('unexpected read'));
  const result = await f.resolveSharedRouteAddresses({ text: 'Ma position', point: { ...point, address: 'Rue des Écoles' } },
    { text: 'Entrée du marché', point });
  assert.deepEqual(result, { departureAddress: 'Rue des Écoles', arrivalAddress: 'Entrée du marché' });
  assert.equal(f.calls.length, 0);
});
test('offline geocoder and timeout keep neutral labels, do not invent a place or cancel shared reads', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(() => new Promise(() => {}));
  const pending = f.resolveSharedRouteAddresses({ text: 'Ma position actuelle', point }, { text: 'Position actuelle', point });
  await tick(); t.mock.timers.tick(3000); await tick();
  assert.deepEqual(await pending, { departureAddress: 'Point de départ (voir la carte)', arrivalAddress: 'Destination (voir la carte)' });
  assert.equal(f.releases(), 2);
  const failure = fixture(async () => { throw Error('offline'); });
  assert.equal((await failure.resolveSharedRouteAddresses({ text: 'Ma position', point }, { text: 'Gare', point: null })).departureAddress,
    'Point de départ (voir la carte)');
});
test('legacy personal labels trigger display enrichment instead of appearing as a real place', () => {
  const { getRouteStopLabel } = loader()('utils/routeLocationLabels.ts');
  for (const name of ['Ma position actuelle', 'Ma position', 'Ma localisation', 'Position actuelle', 'Votre position', '-4.31000, 15.29000']) {
    assert.equal(getRouteStopLabel({ name }).isResolved, false);
    assert.equal(getRouteStopLabel({ name, address: 'Rue des Écoles, Gombe' }).title, 'Rue des Écoles');
  }
});

function publicationFixture(recurring) {
  const { hookHarness } = require('./helpers/hookHarness.cjs');
  const hooks = hookHarness(), posts = [], successes = [];
  let resolveAddress, version = 0;
  const pending = new Promise(resolve => { resolveAddress = resolve; });
  const { usePublishSubmission } = loader({ react: hooks.react,
    '../../features/publish/publishModel': { getLocationCoordinates: () => [15.29, -4.31], isUserDriver: () => true },
    '@/services/sharedRouteAddresses': { resolveSharedRouteAddresses: () => pending },
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
    '@/services/analytics': { trackEvent() {} }, '@/services/driverPermissionOnboarding': { recordDriverPublication() {} },
  })('hooks/publish/usePublishSubmission.ts');
  const create = payload => { posts.push(payload); return { unwrap: async () => ({ id: 'trip' }) }; };
  const props = { publishInFlightRef: { current: false }, isSubmittingTrip: false, hasDepartureAddress: true, hasArrivalAddress: true,
    seats: '2', price: '2500', departureDateTime: new Date('2030-01-01T12:00:00Z'), isDriver: true,
    selectedVehicleId: 'vehicle', isPublishIdentityVerified: true, isRecurringTrip: recurring, recurringWeekdays: [1],
    departureAddress: 'Ma position', arrivalAddress: 'Gare', departureLocation: point, arrivalLocation: null,
    departureReference: 'Entrée principale', arrivalReference: '', description: '',
    formatDateOnlyValue: () => '2030-01-01', formatTimeOnlyValue: () => '12:00',
    createTrip: create, createRecurringTrip: create, setPublicationSuccess: value => successes.push(value),
    showDialog() { assert.fail('unexpected dialog'); },
  };
  return { hooks, posts, successes, render: () => hooks.render(() => usePublishSubmission(props)),
    resolve: () => resolveAddress({ departureAddress: 'Rue des Écoles', arrivalAddress: 'Gare' }), invalidate: () => version++ };
}
for (const recurring of [false, true]) test(`publication ${recurring ? 'recurring' : 'single'} sends the resolved address once and preserves ride fields`, async () => {
  const f = publicationFixture(recurring), started = f.render().handlePublish();
  assert.equal(f.render().isResolvingAddresses, true);
  await f.render().handlePublish(); assert.equal(f.posts.length, 0);
  f.resolve(); await started;
  assert.equal(f.posts.length, 1); assert.equal(f.posts[0].departureLocation, 'Rue des Écoles');
  assert.deepEqual(f.posts[0].departureCoordinates, [15.29, -4.31]);
  assert.equal(f.posts[0].departureReference, 'Entrée principale');
  assert.equal(f.posts[0].totalSeats, 2); assert.equal(f.posts[0].pricePerSeat, 2500);
  assert.equal(f.render().isResolvingAddresses, false); f.hooks.unmount();
});
test('publication never sends a trip if geocoding finishes after unmount or account replacement', async () => {
  for (const cancel of ['unmount', 'logout']) {
    const f = publicationFixture(false), started = f.render().handlePublish();
    if (cancel === 'unmount') f.hooks.unmount(); else f.invalidate();
    f.resolve(); await started; assert.equal(f.posts.length, 0); assert.equal(f.successes.length, 0);
    if (cancel !== 'unmount') f.hooks.unmount();
  }
});
