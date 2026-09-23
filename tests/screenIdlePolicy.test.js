const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function profileFixture() {
  const hooks = hookHarness(), calls = [], dispatches = [];
  const state = { active: true, user: { id: 'driver', role: 'driver' } };
  const values = {
    profile: { user: state.user, stats: { vehicles: 1 } }, vehicles: [{ id: 'car' }],
    kyc: { status: 'approved' }, requests: [{ status: 'pending' }], offers: [],
    referrals: {}, plans: [], premium: { isPremium: false }, payments: [],
    settlements: { availableBalance: 2000 }, reviews: [], rating: {},
  };
  const query = name => (_arg, options) => {
    calls.push({ name, options });
    // Model RTK Query's last successful data retention during skip.
    const retained = hooks.react.useRef();
    if (!options?.skip) retained.current = values[name];
    return { data: retained.current, isLoading: false, isFetching: false, isError: false,
      refetch: () => { throw new Error(`Unexpected hook refetch: ${name}`); } };
  };
  const endpoint = name => ({ initiate: (args, options) => ({ name, args, options }) });
  const dispatch = action => {
    dispatches.push(action);
    return Object.assign(Promise.resolve({ data: values[action.name] }), {
      unwrap: () => Promise.resolve(values[action.name]),
    });
  };
  const load = loader({ react: hooks.react,
    'react-native': { Linking: {} },
    'expo-linking': { createURL: path => `zwanga:///${path}` },
    'expo-web-browser': { maybeCompleteAuthSession() {} },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/store/hooks': { useAppSelector: () => state.user, useAppDispatch: () => dispatch },
    '@/store/selectors': { selectUser: () => state.user },
    '@/store/api/userApi': { useGetProfileSummaryQuery: query('profile'), useGetKycStatusQuery: query('kyc'),
      userApi: { endpoints: { getProfileSummary: endpoint('profile'), getKycStatus: endpoint('kyc') } } },
    '@/store/api/vehicleApi': { useGetVehiclesQuery: query('vehicles'), vehicleApi: { endpoints: { getVehicles: endpoint('vehicles') } } },
    '@/store/api/referralApi': { useGetMyReferralSummaryQuery: query('referrals'), referralApi: { endpoints: { getMyReferralSummary: endpoint('referrals') } } },
    '@/store/api/driverSettlementsApi': { useGetMyDriverSettlementQuery: query('settlements'), driverSettlementsApi: { endpoints: { getMyDriverSettlement: endpoint('settlements') } } },
    '@/store/api/paymentApi': { useGetPendingSubscriptionPaymentsQuery: query('payments') },
    '@/store/api/subscriptionApi': { useGetSubscriptionPlansQuery: query('plans'), useGetPremiumOverviewQuery: query('premium') },
    '@/store/api/reviewApi': { useGetReviewsQuery: query('reviews'), useGetAverageRatingQuery: query('rating') },
    '@/store/api/tripRequestApi': { useGetMyTripRequestsQuery: query('requests'), useGetMyDriverOffersQuery: query('offers') },
  });
  const { useProfileData } = load('hooks/profile/useProfileData.ts');
  return { hooks, state, calls, values, dispatches, render: () => hooks.render(useProfileData) };
}

test('profile pauses ten display reads on blur/background but keeps payment dependencies alive', () => {
  const app = profileFixture(), initial = app.render();
  assert.equal(initial.knownVehicleCount, 1);
  assert.equal(initial.tripRequestsCount, 1);
  app.state.active = false; app.calls.length = 0;
  const hidden = app.render();
  const displayReads = app.calls.filter(call => !['premium', 'payments'].includes(call.name));
  assert.equal(displayReads.length, 10);
  for (const { options } of displayReads) {
    assert.equal(options.skip, true);
    assert.equal(options.pollingInterval, 0);
    assert.equal(options.refetchOnFocus, false);
    assert.equal(options.refetchOnReconnect, false);
  }
  for (const name of ['premium', 'payments']) assert.equal(app.calls.find(call => call.name === name).options.skip, false);
  assert.equal(hidden.vehicleList, initial.vehicleList);
  assert.equal(hidden.tripRequestsStats, initial.tripRequestsStats);
  assert.equal(hidden.currentUser, initial.currentUser);
  app.state.active = true; app.calls.length = 0; app.values.vehicles = [{ id: 'car' }, { id: 'moto' }];
  assert.equal(app.render().knownVehicleCount, 2);
  for (const { options } of app.calls.filter(call => !['premium', 'payments'].includes(call.name))) {
    assert.equal(options.skip, false);
    assert.equal(options.refetchOnMountOrArgChange, 30);
  }
  app.hooks.unmount();
});

test('identity/vehicle callbacks still refresh after blur without creating persistent subscriptions', async () => {
  const app = profileFixture(), initial = app.render();
  app.state.active = false; const hidden = app.render();
  assert.equal(hidden.refetchProfile, initial.refetchProfile);
  assert.equal(hidden.refetchVehicles, initial.refetchVehicles);
  assert.equal(hidden.refetchKycStatus, initial.refetchKycStatus);
  assert.equal((await initial.refetchProfile()).data.user.id, 'driver');
  assert.equal((await initial.refetchVehicles()).data.length, 1);
  assert.deepEqual(await initial.refetchKycStatus().unwrap(), { status: 'approved' });
  for (const action of app.dispatches) assert.deepEqual(action.options, { subscribe: false, forceRefetch: true });
  assert.deepEqual(app.dispatches.map(action => action.name), ['profile', 'vehicles', 'kyc']);
  await hidden.handleRefresh();
  assert.equal(app.dispatches.length, 3, 'no pull-to-refresh work from an inactive screen');
  app.hooks.unmount();
});

test('a not-yet-active profile does not start display requests', () => {
  const app = profileFixture(); app.state.active = false; app.render();
  assert.ok(app.calls.filter(call => !['premium', 'payments'].includes(call.name)).every(call => call.options.skip));
  assert.equal(app.dispatches.length, 0);
  app.hooks.unmount();
});

test('profile resume only reconciles an existing payment; idle resumes do not refresh hidden profile data', async () => {
  const hooks = hookHarness(), calls = [], listeners = new Set();
  const screen = { focused: false };
  const props = { isDriver: true, subscriptionPaymentOrderNumber: null,
    restoredSubscriptionPaymentKeyRef: { current: null }, subscriptionPaymentMountedRef: { current: true },
    refreshSubscriptionFromBackend: async () => calls.push('idle-refresh'),
    checkSubscriptionPaymentByOrderNumber: async order => { calls.push(order); return 'pending'; },
    startSubscriptionPaymentAutoCheck: order => calls.push(`monitor:${order}`),
  };
  const { useProfileSubscriptionLifecycle } = loader({ react: hooks.react,
    '@react-navigation/native': { useIsFocused: () => screen.focused },
    'react-native': { AppState: { addEventListener: (_event, callback) => {
      listeners.add(callback); return { remove: () => listeners.delete(callback) };
    } } },
    'expo-router': { useRouter: () => ({}), useLocalSearchParams: () => ({}) },
  })('hooks/profile/useProfileSubscriptionLifecycle.ts');
  hooks.render(() => useProfileSubscriptionLifecycle(props));
  assert.equal(listeners.size, 0, 'no idle listener while hidden');
  for (let i = 0; i < 50; i++) listeners.forEach(callback => callback('active'));
  assert.deepEqual(calls, []);
  props.subscriptionPaymentOrderNumber = 'pending-order';
  hooks.render(() => useProfileSubscriptionLifecycle(props));
  listeners.forEach(callback => callback('active'));
  await Promise.resolve();
  assert.deepEqual(calls, ['pending-order', 'monitor:pending-order']);
  assert.equal(listeners.size, 1);
  props.subscriptionPaymentOrderNumber = null; screen.focused = true;
  hooks.render(() => useProfileSubscriptionLifecycle(props));
  listeners.forEach(callback => callback('active'));
  assert.equal(calls.at(-1), 'idle-refresh', 'a visible profile still refreshes subscription state on resume');
  hooks.unmount(); assert.equal(listeners.size, 0);
});
