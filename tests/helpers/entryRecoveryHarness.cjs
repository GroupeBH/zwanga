const { loader } = require('./loadTypeScript.cjs');
const { hookHarness } = require('./hookHarness.cjs');

// Exercise the producer and both entry consumers against the SAME query caches.
function entryRecoveryHarness(t) {
  const producerHooks = hookHarness(), entryHooks = hookHarness();
  let currentHooks;
  const react = Object.fromEntries(Object.keys(entryHooks.react).map(key => [key, (...args) => currentHooks.react[key](...args)]));
  react.useSyncExternalStore = (_subscribe, getSnapshot) => getSnapshot();
  const now = Date.now(), section = count => ({ count, revision: 'a'.repeat(64) });
  const trip = { id: 'trip', driverId: 'driver', tripRequestId: 'request', status: 'upcoming', departureTime: '2026-10-19T10:00:00Z' };
  const request = { id: 'request', passengerId: 'passenger', selectedDriverId: 'driver', tripId: 'trip',
    status: 'driver_selected', departureDateMin: trip.departureTime, departureDateMax: '2026-10-19T11:00:00Z' };
  const summary = { schemaVersion: 1, userId: 'driver', hasLiveActivity: true, passengerTrackingBookingId: null,
    trips: section(1), bookings: section(0), requests: section(0) };
  const env = { active: true, path: '/', busy: false, trip, request, summary, reads: [], routes: [],
    state: { auth: { isAuthenticated: true, user: { id: 'driver' } }, zwangaApi: { config: { online: true } } },
    activity: { data: summary, currentData: summary, isSuccess: true, fulfilledTimeStamp: now - 1000 },
    trips: { data: [trip], isSuccess: true, fulfilledTimeStamp: now - 1000 },
    bookings: { data: [], isSuccess: true, fulfilledTimeStamp: now - 1000 },
    requests: { data: [], isSuccess: true, fulfilledTimeStamp: now - 1000 },
    profile: { data: { id: 'driver', role: 'driver' }, isSuccess: true },
  };
  const store = { getState: () => env.state };
  const listNames = { getMyActivityTrips: 'trips', getMyActivityBookings: 'bookings', getMyTripRequests: 'requests' };
  const dispatch = action => {
    if (action.running) return undefined;
    env.reads.push(action.name);
    return { unwrap: async () => {
      if (env.fail?.(action.name)) throw { status: 503 };
      const category = listNames[action.name];
      if (category) {
        env[category] = { ...env[category], isSuccess: true, isFetching: false, fulfilledTimeStamp: Date.now() };
        return env[category].data;
      }
      if (action.name === 'getAccountActivity') {
        env.activity = { ...env.activity, isSuccess: true, isFetching: false, fulfilledTimeStamp: Date.now() };
        return env.summary;
      }
      if (action.name === 'getTripById') return env.trip;
      if (action.name === 'getTripRequestById') return env.request;
      throw new Error(`Unexpected action: ${action.name}`);
    } };
  };
  const endpoint = (name, category) => ({ useQueryState: () => env[category], select: () => () => listNames[name] ? env[category] : {},
    initiate: () => ({ name }) });
  const api = (category, list, detail) => ({ endpoints: { [list]: endpoint(list, category), [detail]: endpoint(detail, category) },
    util: { getRunningQueryThunk: () => ({ running: true }) } });
  const load = loader({ react,
    'react-native': { View: 'View', StyleSheet: { create: value => value, absoluteFillObject: { position: 'absolute' } } },
    'react-redux': { useStore: () => store },
    'expo-router': { usePathname: () => env.path, useSegments: () => ['(tabs)'], useRootNavigationState: () => ({ key: 'root' }),
      useRouter: () => ({ replace: path => env.routes.push(path) }) },
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: selector => selector(env.state) },
    '@/store/selectors': { selectIsAuthenticated: state => state.auth.isAuthenticated },
    '@/store/api/tripApi': { tripApi: api('trips', 'getMyActivityTrips', 'getTripById'), useGetMyActivityTripsQuery: () => ({}) },
    '@/store/api/bookingApi': { bookingApi: api('bookings', 'getMyActivityBookings', 'getBookingById'), useGetMyActivityBookingsQuery: () => ({}) },
    '@/store/api/tripRequestApi': { tripRequestApi: api('requests', 'getMyTripRequests', 'getTripRequestById'), useGetMyTripRequestsQuery: () => ({}) },
    '@/store/api/accountActivityApi': { accountActivityApi: { endpoints: { getAccountActivity: endpoint('getAccountActivity', 'activity') } },
      useGetAccountActivityQuery: () => env.activity },
    '@/store/api/userApi': { userApi: { endpoints: { getCurrentUser: endpoint('getCurrentUser', 'profile') } } },
    '@/store/api/driverDispatchApi': { driverDispatchApi: { endpoints: { driverDispatchStatus: { useQueryState: () => ({}) } } } },
    '@/hooks/useAppIsActive': { useAppIsActive: () => env.active },
    '@/components/home/HomeRoleLoader': { HomeRoleLoader: 'EntryLoader' },
    '@/components/home/EntrySyncBanner': { EntrySyncBanner: 'SyncBanner' },
    '@/features/navigation/homeEntryStatusContext': { HomeEntryStatusContext: { Provider: 'StatusProvider' } },
    '@/features/navigation/appEntryContext': { AppEntryContext: { Provider: 'EntryProvider' } },
    '@/features/navigation/RideOverlayProvider': { useRideOverlay: () => ({ store: {
      subscribe: () => () => {}, isBusy: () => env.busy,
    } }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => 0 },
    '@/services/appActivity': { isAppActive: () => env.active },
  });
  const Producer = load('components/AccountActivityCoordinator.tsx').AccountActivityCoordinator;
  const Entry = load('components/ActiveRideResumeCoordinator.tsx').ActiveRideResumeCoordinator;
  t.after(() => { producerHooks.unmount(); entryHooks.unmount(); });
  return Object.assign(env, {
    produce: () => { currentHooks = producerHooks; return producerHooks.render(Producer); },
    enter: () => { currentHooks = entryHooks; return entryHooks.render(() => Entry({ children: 'navigator' })).props.children[1] || null; },
    banner: () => { currentHooks = entryHooks; const status = entryHooks.render(() => Entry({ children: 'navigator' })).props.children[0].props.value;
      return status ? { props: status } : null; },
    load,
  });
}
module.exports = { entryRecoveryHarness };
