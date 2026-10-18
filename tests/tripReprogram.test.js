const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

function setup({ reprogram = true, publish } = {}) {
  const calls = { published: [], updated: [], navigated: [], dialogs: [], closed: 0 };
  const load = loader({
    react: { useRef: value => ({ current: value }), useState: value => [value, () => {}] },
    'expo-router': { useRouter: () => ({ replace: path => calls.navigated.push(path) }) },
    '@/store/api/tripApi': { useReprogramTripMutation: () => [body => ({ unwrap: async () => {
      calls.published.push(body); return publish ? publish() : { id: 'new-trip' };
    } })] },
    '../../features/trip-detail/tripDetailModel': {
      getLocationText: point => point?.address || '',
      getLocationCoordinatesTuple: point => point ? [point.longitude, point.latitude] : undefined,
    },
    '@/utils/errorHelpers': { isPassengerKycRequiredError: () => false, getApiErrorMessage: (_error, fallback) => fallback },
  });
  const point = { address: 'Gombe', longitude: 15.31, latitude: -4.31 };
  const trip = { id: 'old-trip', canReprogram: reprogram, departure: { address: 'Gombe', lng: 15.31, lat: -4.31 },
    arrival: { address: 'Limete', lng: 15.32, lat: -4.32 }, price: 5000 };
  const params = { trip, isTripDriver: true, editDateTime: new Date('2030-10-09T08:00:00Z'),
    editVehicleId: 'vehicle', editSeats: '3', editPrice: '6000', editRouteMode: 'map',
    editDepartureSelection: point, editArrivalSelection: { address: 'Limete', longitude: 15.32, latitude: -4.32 },
    showDialog: dialog => calls.dialogs.push(dialog), editRequiresPassengerKyc: false,
    closeEditModal: () => { calls.closed++; }, refetchTrip: () => {},
    updateTripMutation: body => ({ unwrap: async () => { calls.updated.push(body); return trip; } }),
  };
  return { ...load('hooks/trip-detail/useTripDetailEditSubmission.ts').useTripDetailEditSubmission(params), calls };
}

test('reprogram publishes via the dedicated action and opens the new trip ID', async () => {
  const ctx = setup(); await ctx.handleSaveTrip();
  assert.equal(ctx.calls.published.length, 1);
  assert.equal(ctx.calls.published[0].id, 'old-trip');
  assert.equal(ctx.calls.published[0].updates.totalSeats, 3);
  assert.deepEqual(ctx.calls.navigated, ['/trip/new-trip']);
  assert.equal(ctx.calls.updated.length, 0);
  assert.equal(ctx.calls.closed, 1);
});
test('ordinary modification keeps the existing PUT workflow and trip ID', async () => {
  const ctx = setup({ reprogram: false }); await ctx.handleSaveTrip();
  assert.equal(ctx.calls.updated.length, 1);
  assert.equal(ctx.calls.published.length, 0);
  assert.deepEqual(ctx.calls.navigated, []);
});
test('double taps do not create two publications while awaiting the server', async () => {
  let finish;
  const response = new Promise(resolve => { finish = resolve; });
  const ctx = setup({ publish: () => response });
  const first = ctx.handleSaveTrip(); await ctx.handleSaveTrip();
  assert.equal(ctx.calls.published.length, 1);
  finish({ id: 'new-trip' }); await first;
});
test('a failed publication keeps the form and history open without success navigation', async () => {
  const ctx = setup({ publish: () => { throw new Error('quota exceeded'); } });
  await ctx.handleSaveTrip();
  assert.equal(ctx.calls.closed, 0);
  assert.deepEqual(ctx.calls.navigated, []);
  assert.equal(ctx.calls.dialogs.at(-1).variant, 'danger');
});
