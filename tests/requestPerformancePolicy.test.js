const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { requestDetailPollInterval, sharedOffersPollInterval } = loader()('features/request-detail/requestPollingPolicy.ts');

test('live socket reduces reads but never removes periodic recovery or speeds up terminal requests', () => {
  const request = { status: 'pending', passengerId: 'passenger' };
  for (const status of ['pending', 'offers_received']) {
    assert.equal(requestDetailPollInterval({ ...request, status }, 'passenger', false), 5000);
    assert.equal(requestDetailPollInterval({ ...request, status }, 'passenger', true), 30000);
    assert.equal(requestDetailPollInterval({ ...request, status }, 'driver', true), 30000);
    assert.equal(requestDetailPollInterval({ ...request, status }, 'driver', false), 30000);
  }
  for (const connected of [true, false]) {
    assert.equal(requestDetailPollInterval({ ...request, status: 'driver_selected' }, 'passenger', connected), 15000);
    for (const status of ['cancelled', 'expired', 'completed'])
      assert.equal(requestDetailPollInterval({ ...request, status }, 'passenger', connected), 0);
  }
  assert.equal(sharedOffersPollInterval(false), 15000);
  assert.equal(sharedOffersPollInterval(true), 30000);
});

test('socket observer follows disconnect/reconnect, releases when hidden and cannot reuse another account state', () => {
  const hooks = hookHarness(); let receive, stops = 0;
  const state = { id: 'one', connected: false, enabled: true };
  const { useRideSocketConnected } = loader({ react: hooks.react,
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: { id: state.id } } }) },
    '@/services/chatSocket': { chatSocket: { subscribeToConnectionState: callback => {
      receive = callback; callback(state.connected); return () => { stops++; receive = null; };
    } } },
  })('hooks/notifications/useRideSocketConnected.ts');
  const render = () => hooks.render(() => useRideSocketConnected(state.enabled));
  assert.equal(render(), false); assert.equal(render(), false);
  receive(true); assert.equal(render(), true);
  receive(false); assert.equal(render(), false);
  receive(true); assert.equal(render(), true);
  state.enabled = false; assert.equal(render(), false); assert.equal(stops, 1);
  state.enabled = true; assert.equal(render(), false); assert.equal(render(), false);
  receive(true); assert.equal(render(), true);
  state.id = 'two'; assert.equal(render(), false); assert.equal(render(), false);
  hooks.unmount(); assert.equal(stops, 3);
});

test('request hook restores fast fallback and keeps valid decisions available during a silent refresh only', () => {
  const hooks = hookHarness(), reads = [];
  const user = { id: 'owner', role: 'driver', isDriver: true };
  const state = { active: true, online: true, connected: true, fetching: false, error: undefined,
    request: { id: 'request', passengerId: 'owner', status: 'pending' } };
  const query = (name, data) => (arg, options = {}) => {
    const value = typeof data === 'function' ? data() : data;
    reads.push({ name, options });
    return { data: value, currentData: options.skip ? undefined : value,
      isFetching: name === 'request' && state.fetching,
      isError: name === 'request' && !!state.error, error: name === 'request' ? state.error : undefined,
      refetch: async () => ({ data: value }) };
  };
  const api = endpoints => new Proxy(endpoints, { get: (target, key) => target[key] ?? (() => [() => {}, {}]) });
  const { useRequestDetailData } = loader({ react: hooks.react,
    '@/store/hooks': { useAppSelector: select => select({ auth: { user }, zwangaApi: { config: { online: state.online } } }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/hooks/useIdentityCheck': { useIdentityCheck: () => ({ isIdentityVerified: true }) },
    '@/hooks/useAssignedTripNavigation': { useAssignedTripNavigation: () => ({}) },
    '@/hooks/notifications/useRideSocketConnected': { useRideSocketConnected: () => state.connected },
    './useRequestDetailExit': { useRequestDetailExit: () => ({ goHome() {}, leaving: false }) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog() {} }) },
    '@/services/entryRecovery': { reportEntryFailure() {} },
    'expo-router': { useRouter: () => ({}), useLocalSearchParams: () => ({ id: 'request' }) },
    '@/store/api/tripApi': api({ useGetTripByIdQuery: query('trip', {}) }),
    '@/store/api/bookingApi': api({ useGetMyBookingsForTripQuery: query('bookings', []) }),
    '@/store/api/tripRequestApi': api({ useGetTripRequestByIdQuery: query('request', () => state.request) }),
    '@/store/api/userApi': api({ useGetCurrentUserQuery: query('user', user) }),
    '@/store/api/vehicleApi': api({ useGetVehiclesQuery: query('vehicles', []) }),
  })('hooks/request-detail/useRequestDetailData.ts');
  const render = () => hooks.render(useRequestDetailData);
  render(); assert.equal(render().canRespondToRequest, true);
  const poll = () => reads.filter(read => read.name === 'request').at(-1).options.pollingInterval;
  assert.equal(poll(), 30000);
  state.fetching = true; assert.equal(render().canRespondToRequest, true);
  state.connected = false; render(); render(); assert.equal(poll(), 5000);
  state.online = false; assert.equal(render().canRespondToRequest, false); assert.equal(poll(), 0);
  state.online = true; state.error = { status: 403 }; assert.equal(render().canRespondToRequest, false);
  state.error = undefined; state.active = false; assert.equal(render().canRespondToRequest, false);
  state.active = true; assert.equal(render().canRespondToRequest, true);
  state.request = { ...state.request, status: 'driver_selected', tripId: 'trip' }; render(); render();
  assert.equal(poll(), 15000);
  assert.equal(reads.filter(read => read.name === 'bookings').at(-1).options.pollingInterval, 5000,
    'confirmed booking/navigation handoff keeps its existing fast recovery');
  hooks.unmount();
});
