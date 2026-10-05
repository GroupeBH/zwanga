const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture() {
  const hooks = hookHarness(), calls = [], reads = [];
  const state = { active: true, online: true, id: 'trip', user: { id: 'owner', role: 'driver', isDriver: true } };
  const trip = { id: 'trip', driverId: 'owner', status: 'upcoming' };
  const query = (name, data) => (arg, options = {}) => {
    calls.push({ name, arg, options });
    return { data, currentData: options.skip ? undefined : data, isUninitialized: Boolean(options.skip),
      refetch: async () => { assert.equal(Boolean(options.skip), false); reads.push(name); return { data }; } };
  };
  const api = endpoints => new Proxy(endpoints, { get: (target, property) => target[property] ?? (() => [() => {}, {}]) });
  const load = loader({ react: hooks.react,
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: state.user }, zwangaApi: { config: { online: state.online } } }) },
    '@/store/selectors': { selectUser: value => value.auth.user },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/hooks/useIdentityCheck': { useIdentityCheck: () => ({ isIdentityVerified: true }) },
    '@/hooks/useUserLocation': { useUserLocation: () => ({}) },
    '@/hooks/useAssignedTripNavigation': { useAssignedTripNavigation: () => ({}) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog() {} }) },
    'expo-router': { useRouter: () => ({}), useLocalSearchParams: () => ({ id: state.id }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({}) },
    '@/store/api/tripApi': api({ useGetTripByIdQuery: query('trip', trip) }),
    '@/store/api/bookingApi': api({ useGetTripBookingsQuery: query('bookings', [{ id: 'booking', tripId: 'trip' }]) }),
    '@/store/api/googleMapsApi': api({}),
    '@/store/api/tripRequestApi': api({ useGetTripRequestByIdQuery: query('request', { id: 'trip', tripId: 'trip', status: 'driver_selected' }) }),
    '@/store/api/userApi': api({ useGetCurrentUserQuery: query('user', state.user), useGetProfileSummaryQuery: query('profile', { user: state.user }) }),
    '@/store/api/vehicleApi': api({ useGetVehiclesQuery: query('vehicles', []) }),
    '../../features/publish/publishModel': { isUserDriver: () => true },
  });
  return { hooks, state, calls, reads, load };
}

for (const [path, name, refresh] of [
  ['manage-trip/useManageTripState', 'useManageTripState', 'refetchTrip'],
  ['request-detail/useRequestDetailData', 'useRequestDetailData', 'refetch'],
  ['publish/usePublishVehicleState', 'usePublishVehicleState', 'refetchVehicles'],
]) test(`${name}: actual hooks pause all display reads offline/hidden and guard a late refresh`, async () => {
  const env = fixture(), hook = env.load(`hooks/${path}.ts`)[name];
  const render = () => env.hooks.render(hook);
  render(); const view = render(), late = view[refresh];
  await late(); assert.equal(env.reads.length, 1);
  env.state.online = false; env.calls.length = 0;
  const offline = render();
  assert.ok(env.calls.every(call => call.options.skip));
  assert.ok((await late()).error); assert.equal(env.reads.length, 1);
  if (name === 'useManageTripState') assert.equal(offline.trip.id, 'trip');
  if (name === 'useRequestDetailData') assert.equal(offline.tripRequest.id, 'trip');
  env.state.online = true; env.state.active = false; env.calls.length = 0; render();
  assert.ok(env.calls.every(call => call.options.skip));
  assert.ok((await late()).error);
  env.state.active = true; env.calls.length = 0; const resumed = render();
  assert.ok(env.calls.some(call => !call.options.skip));
  assert.ok(env.calls.every(call => call.options.refetchOnFocus === false));
  await resumed[refresh](); assert.equal(env.reads.length, 2);
  env.hooks.unmount(); assert.ok((await resumed[refresh]()).error);
});
