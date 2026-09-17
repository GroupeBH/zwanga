const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const action = (callback) => (args) => ({ unwrap: () => callback(args) });
const errors = {
  getApiErrorMessage: (_error, fallback) => fallback,
  isAmbiguousTransportError: (error) => error.status === 'TIMEOUT_ERROR',
  isDriverRequiredError: () => false,
  createBecomeDriverAction: () => ({ label: 'Devenir conducteur' }),
};
function environment(extra = {}) {
  const hooks = hookHarness();
  const dialogs = [];
  const showDialog = (dialog) => dialogs.push(dialog);
  const load = loader({
    react: hooks.react,
    'react-native': { Keyboard: { dismiss() {} }, Linking: {} },
    'expo-linking': { createURL: (path) => 'zwanga:///' + path },
    'expo-web-browser': { maybeCompleteAuthSession() {} },
    'expo-router': { useRouter: () => ({ push() {}, replace() {} }) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog }) },
    '@/utils/errorHelpers': errors,
    '@/constants/network': { MUTATION_RECONCILIATION_DELAYS_MS: [0, 0] },
    ...extra,
  });
  return { hooks, dialogs, load };
}

test('pending payment storage keeps account ownership, expiry, and payment method semantics', () => {
  const { load } = environment();
  const model = load('features/profile/profileModel.ts');
  assert.notEqual(model.getSubscriptionPendingPaymentKey('a'), model.getSubscriptionPendingPaymentKey('b'));
  const payment = { userId: 'a', channel: 'mpesa', orderNumber: 'order', createdAt: new Date().toISOString() };
  assert.equal(model.parseStoredSubscriptionPayment(JSON.stringify(payment)).paymentMethod, 'mobile_money');
  assert.equal(model.parseStoredSubscriptionPayment(JSON.stringify({ ...payment, channel: 'card' })).paymentMethod, 'card');
  assert.equal(model.parseStoredSubscriptionPayment(JSON.stringify({ ...payment, createdAt: new Date(Date.now() - 31 * 60000).toISOString() })), null);
  assert.equal(model.parseStoredSubscriptionPayment('{invalid'), null);
  assert.equal(model.parseStoredSubscriptionPayment(JSON.stringify({ ...payment, channel: 'unknown' })), null);
  assert.equal(model.isSubscriptionPaymentComplete({ payment: { status: 'pending' } }), false);
  assert.equal(model.isSubscriptionPaymentComplete({ subscription: { status: 'active' } }), true);
  assert.equal(model.isSubscriptionPaymentComplete({ payment: { status: 'succeeded' } }), true);
  assert.equal(model.isSubscriptionPaymentFailed({ payment: { status: 'failed' } }), true);
});

test('vehicle matching remains case insensitive and includes all vehicle fields', () => {
  const { vehicleMatchesFormData } = environment().load('features/profile/profileModel.ts');
  const vehicle = { type: 'car', brand: 'Dacia', model: 'Sandero', color: 'Violet', licensePlate: 'ABC123' };
  assert.equal(vehicleMatchesFormData(vehicle, { ...vehicle, brand: ' DACIA ' }), true);
  assert.equal(vehicleMatchesFormData(vehicle, { ...vehicle, licensePlate: 'OTHER' }), false);
  assert.equal(vehicleMatchesFormData(vehicle, { ...vehicle, type: 'moto' }), false);
});

function onboardingApp(extra = {}) {
  const calls = [], dialogs = [], hooks = hookHarness();
  const props = {
    currentUser: { id: 'passenger', role: 'passenger' },
    hasVehicle: false, isKycApproved: false, isKycPending: false, kycLoading: false,
    needsDriverOnboarding: true, vehiclesLoading: false,
    openCreateVehicleModal: () => calls.push('vehicle'),
    refetchKycStatus: async () => {}, refetchProfile: async () => {}, ...extra,
  };
  const { useProfileOnboarding } = loader({
    react: hooks.react,
    'expo-router': { useRouter: () => ({ push() {} }), useLocalSearchParams: () => ({}) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: dialog => dialogs.push(dialog) }) },
    '@/hooks/useDiditKycFlow': { useDiditKycFlow: () => ({ startDiditKyc: async () => { calls.push('identity'); }, isStartingDiditKyc: false }) },
    '@/store/api/userApi': { useUpdateUserMutation: () => [form => ({ unwrap: async () => { calls.push(['role', form.get('role')]); } }), { isLoading: false }] },
  })('hooks/profile/useProfileOnboarding.ts');
  return { hooks, calls, dialogs, props, render: () => hooks.render(() => useProfileOnboarding(props)) };
}

test('passenger identity verification neither asks for a vehicle nor changes account role', async () => {
  const app = onboardingApp();
  await app.render().handleOpenKycModal();
  assert.deepEqual(app.calls, ['identity']);
  assert.deepEqual(app.dialogs, []);
  app.hooks.unmount();
});

test('only explicit driver onboarding requires a vehicle; approved identity is reused', async () => {
  const app = onboardingApp({ isKycApproved: true });
  app.render().handleStartDriverOnboarding();
  assert.deepEqual(app.calls, ['vehicle']);
  app.props.hasVehicle = true;
  app.render().handleStartDriverOnboarding();
  await tick();
  assert.deepEqual(app.calls, ['vehicle', ['role', 'driver']]);
  app.hooks.unmount();
});

test('pending/approved identities show a status instead of starting another verification', async () => {
  for (const status of ['isKycApproved', 'isKycPending']) {
    const app = onboardingApp({ [status]: true });
    await app.render().handleOpenKycModal();
    assert.deepEqual(app.calls, []);
    assert.doesNotMatch(app.dialogs[0].title, /kyc/i);
    app.hooks.unmount();
  }
});

test('profile reads keep server data in RTK Query and skip driver-only refreshes for a passenger', async () => {
  const calls = [], refreshes = [];
  const query = (name, data) => (_args, options) => {
    calls.push({ name, options });
    return { data, refetch: async () => { refreshes.push(name); return { data }; }, isLoading: false, isFetching: false, isError: false };
  };
  const user = { id: 'passenger', role: 'passenger', rating: 4 };
  const app = environment({
    '@/store/hooks': { useAppSelector: () => user },
    '@/store/selectors': { selectUser: () => user },
    '@/store/api/userApi': { useGetProfileSummaryQuery: query('profile', { user, stats: {} }), useGetKycStatusQuery: query('kyc', {}) },
    '@/store/api/vehicleApi': { useGetVehiclesQuery: query('vehicles', []) },
    '@/store/api/referralApi': { useGetMyReferralSummaryQuery: query('referrals', {}) },
    '@/store/api/driverSettlementsApi': { useGetMyDriverSettlementQuery: query('settlements') },
    '@/store/api/paymentApi': { useGetPaymentHistoryQuery: query('payments') },
    '@/store/api/subscriptionApi': { useGetSubscriptionPlansQuery: query('plans', []), useGetPremiumOverviewQuery: query('premium') },
    '@/store/api/reviewApi': { useGetReviewsQuery: query('reviews', []), useGetAverageRatingQuery: query('rating', {}) },
    '@/store/api/tripRequestApi': { useGetMyTripRequestsQuery: query('requests', []), useGetMyDriverOffersQuery: query('offers', []) },
  });
  const { useProfileData } = app.load('hooks/profile/useProfileData.ts');
  const profile = app.hooks.render(useProfileData);
  assert.equal(profile.currentUser, user);
  assert.equal(profile.reviewAverage, 4);
  for (const name of ['premium', 'payments', 'settlements']) assert.equal(calls.find(call => call.name === name).options.skip, true);
  assert.equal(new Set(calls.map(call => call.name)).size, calls.length);
  await profile.handleRefresh();
  assert.deepEqual(refreshes.sort(), ['kyc', 'profile', 'referrals', 'vehicles']);
  app.hooks.unmount();
});

test('ambiguous vehicle creation verifies the new vehicle without replaying the mutation', async () => {
  const calls = [];
  const vehicle = { id: 'new', type: 'car', brand: 'Dacia', model: 'Sandero', color: 'violet', licensePlate: '1234AB56' };
  const app = environment({
    '@/store/api/vehicleApi': {
      useCreateVehicleMutation: () => [action(async payload => { calls.push(payload); throw { status: 'TIMEOUT_ERROR' }; }), { isLoading: false }],
      useUpdateVehicleMutation: () => [action(async () => { throw new Error('Unexpected update'); }), { isLoading: false }],
      useDeleteVehicleMutation: () => [action(async () => {}), { isLoading: false }],
    },
  });
  const { useProfileVehicles } = app.load('hooks/profile/useProfileVehicles.ts');
  const props = { vehicleList: [], refetchVehicles: async () => ({ data: [vehicle] }), refetchProfile: async () => ({}) };
  const render = () => app.hooks.render(() => useProfileVehicles(props));
  let form = render();
  form.setVehicleType('car');
  form.handleVehicleBrandChange(' Dacia ');
  form.handleVehicleModelChange('Sandero');
  form.handleVehicleColorChange('violet');
  form.handleVehiclePlateChange('1234ab56');
  form = render();
  await form.handleSaveVehicle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].brand, 'Dacia');
  assert.equal(render().vehicleModalVisible, false);
  assert.equal(app.dialogs.at(-1).variant, 'success');
  app.hooks.unmount();
});

test('vehicle deletion still requires confirmation and reconciles a transport timeout by reading', async () => {
  let deletes = 0, reads = 0;
  const app = environment({
    '@/store/api/vehicleApi': {
      useCreateVehicleMutation: () => [action(async () => {}), { isLoading: false }],
      useUpdateVehicleMutation: () => [action(async () => {}), { isLoading: false }],
      useDeleteVehicleMutation: () => [action(async () => { deletes++; throw { status: 'TIMEOUT_ERROR' }; }), { isLoading: false }],
    },
  });
  const { useProfileVehicles } = app.load('hooks/profile/useProfileVehicles.ts');
  const form = app.hooks.render(() => useProfileVehicles({ vehicleList: [], refetchVehicles: async () => { reads++; return { data: [] }; }, refetchProfile: async () => ({}) }));
  form.handleDeleteVehicle({ id: 'car', brand: 'Dacia', model: 'Sandero', licensePlate: 'ABC123' });
  assert.equal(deletes, 0);
  await app.dialogs[0].actions.find(action => action.label === 'Supprimer').onPress();
  assert.equal(deletes, 1);
  assert.ok(reads > 0);
  assert.equal(app.dialogs.at(-1).title, 'Véhicule supprimé');
  app.hooks.unmount();
});

test('profile forgotten PIN uses the reset proof and clears the local session', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const mutation = (name) => [payload => ({
    unwrap: async () => {
      calls.push({ name, payload });
      return name === 'verify' ? { resetToken: 'proof', expiresInSeconds: 300 } : {};
    },
    reset() {},
  }), { isLoading: false }];
  const app = environment({ '@/store/api/userApi': {
    useUpdatePinMutation: () => mutation('update'),
  },
    '@/store/api/authApi': {
      useRequestPinResetOtpMutation: () => mutation('send'),
      useVerifyPinResetOtpMutation: () => mutation('verify'),
      useResetPinMutation: () => mutation('reset'),
    },
    '@/services/tokenStorage': { clearTokens: async () => calls.push({ name: 'clear' }) },
    '@/store/hooks': { useAppDispatch: () => value => calls.push(value) },
    '@/store/slices/authSlice': { logout: () => ({ name: 'logout' }) },
  });
  const { useProfilePin } = app.load('hooks/profile/useProfilePin.ts');
  const render = () => app.hooks.render(() => useProfilePin({ currentUser: { phone: '0991234567' } }));
  render().handleOpenPinModal();
  render().handleOldPinChange('1x234567');
  assert.equal(render().oldPin, '1234');
  await render().handleForgotPin();
  assert.deepEqual(calls[0], { name: 'send', payload: { phone: '0991234567' } });
  render().handleOtpInputChange('123456', 0);
  await render().handleVerifyOtpForPinChange();
  assert.equal(render().pinStep, 'newPin');
  assert.deepEqual(calls[1].payload, { phone: '0991234567', otp: '123456' });
  render().handleNewPinChange('5678');
  render().handleNewPinConfirmChange('5678');
  await render().handleUpdatePin();
  assert.deepEqual(calls[2], { name: 'reset', payload: { resetToken: 'proof', newPin: '5678' } });
  assert.deepEqual(calls.slice(3), [{ name: 'clear' }, { name: 'logout' }]);
  assert.equal(render().oldPin, '');
  assert.equal(render().newPin, '');
  assert.deepEqual(render().otpCode, ['', '', '', '', '', '']);
  app.hooks.unmount();
});

for (const refused of [false, true]) {
  test(`profile sends the old PIN to the server and logs out only after success (refused=${refused})`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const calls = [], navigation = [];
    const unused = () => [() => { throw new Error('OTP not expected for a known PIN'); }, { isLoading: false }];
    const app = environment({
      '@/store/api/userApi': {
        useUpdatePinMutation: () => [payload => ({
          unwrap: async () => {
            calls.push({ name: 'update', payload });
            if (refused) throw { status: 401 };
            return {};
          },
          reset: () => calls.push({ name: 'discard' }),
        }), { isLoading: false }],
      },
      '@/store/api/authApi': {
        useRequestPinResetOtpMutation: unused,
        useVerifyPinResetOtpMutation: unused,
        useResetPinMutation: unused,
      },
      '@/services/tokenStorage': { clearTokens: async () => calls.push({ name: 'clear' }) },
      '@/store/hooks': { useAppDispatch: () => value => calls.push(value) },
      '@/store/slices/authSlice': { logout: () => ({ name: 'logout' }) },
      'expo-router': { useRouter: () => ({ replace: route => navigation.push(route) }) },
    });
    const { useProfilePin } = app.load('hooks/profile/useProfilePin.ts');
    const render = () => app.hooks.render(() => useProfilePin({ currentUser: { phone: '0991234567' } }));
    render().handleOpenPinModal();
    render().handleOldPinChange('1234');
    render().handleVerifyOldPin();
    render().handleNewPinChange('5678');
    render().handleNewPinConfirmChange('5678');
    await render().handleUpdatePin();
    assert.deepEqual(calls[0], { name: 'update', payload: { oldPin: '1234', newPin: '5678' } });
    assert.equal(render().oldPin, '');
    assert.equal(render().newPin, '');
    if (refused) {
      assert.deepEqual(calls.map(call => call.name), ['update', 'discard']);
      assert.equal(render().pinStep, 'oldPin');
      assert.deepEqual(navigation, []);
      assert.equal(app.dialogs.at(-1).variant, 'danger');
    } else {
      assert.deepEqual(calls.map(call => call.name), ['update', 'discard', 'clear', 'logout']);
      assert.deepEqual(navigation, ['/auth?mode=login']);
      assert.equal(render().pinModalVisible, false);
      assert.equal(app.dialogs.at(-1).variant, 'success');
    }
    app.hooks.unmount();
  });
}

test('restoring a payment rejects a stored reference belonging to another account', async () => {
  const deleted = [];
  const stored = { userId: 'another', channel: 'mpesa', orderNumber: 'order', createdAt: new Date().toISOString() };
  const app = environment({ '@react-native-async-storage/async-storage': { getItem: async () => JSON.stringify(stored), removeItem: async key => deleted.push(key) } });
  const { useProfileSubscriptionStorage } = app.load('hooks/profile/useProfileSubscriptionStorage.ts');
  const storage = app.hooks.render(() => useProfileSubscriptionStorage({ currentUser: { id: 'mine' }, paymentHistoryLoaded: true, recentPendingSubscriptionOrderNumber: 'order' }));
  assert.equal(await storage.readStoredSubscriptionPayment(), null);
  assert.deepEqual(deleted, ['zwanga:subscription:pending-payment:mine']);
  app.hooks.unmount();
});

function paymentEnvironment(extra = {}) {
  const app = environment(extra);
  const stateHook = app.load('hooks/profile/useProfileSubscriptionState.ts').useProfileSubscriptionState;
  return { ...app, stateHook };
}

test('payment monitoring stops before its next read after unmount', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reads = 0;
  const check = action(async () => { reads++; return { payment: { status: 'pending' } }; });
  const app = paymentEnvironment({ '@/store/api/subscriptionApi': { useLazyCheckSubscriptionPaymentStatusQuery: () => [check, { isFetching: false }] } });
  const { useProfileSubscriptionMonitor } = app.load('hooks/profile/useProfileSubscriptionMonitor.ts');
  const monitor = app.hooks.render(() => {
    const state = app.stateHook({ currentUser: { phone: '0991234567' } });
    return useProfileSubscriptionMonitor({ ...state, clearStoredSubscriptionPayment: async () => {}, refetchProfile: async () => {}, refetchPremiumOverview: async () => {} });
  });
  monitor.startSubscriptionPaymentAutoCheck('order');
  app.hooks.unmount();
  t.mock.timers.tick(3500);
  await tick();
  assert.equal(reads, 0);
});

test('only a confirmed payment clears its reference and refreshes subscription/profile data', async () => {
  const events = [];
  const app = paymentEnvironment({ '@/store/api/subscriptionApi': { useLazyCheckSubscriptionPaymentStatusQuery: () => [action(async () => ({})), { isFetching: false }] } });
  const { useProfileSubscriptionMonitor } = app.load('hooks/profile/useProfileSubscriptionMonitor.ts');
  const monitor = app.hooks.render(() => {
    const state = app.stateHook({ currentUser: null });
    return useProfileSubscriptionMonitor({ ...state, clearStoredSubscriptionPayment: async () => events.push('clear'), refetchProfile: async () => events.push('profile'), refetchPremiumOverview: async () => events.push('premium') });
  });
  assert.equal(await monitor.finishSubscriptionPayment({ payment: { status: 'pending' } }), false);
  assert.deepEqual(events, []);
  assert.equal(await monitor.finishSubscriptionPayment({ payment: { status: 'succeeded' } }), true);
  assert.deepEqual(events.sort(), ['clear', 'premium', 'profile']);
  assert.equal(app.dialogs.at(-1).title, 'Abonnement actif');
  app.hooks.unmount();
});

function checkoutEnvironment(subscribe) {
  const app = paymentEnvironment({ '@/store/api/subscriptionApi': { useSubscribeToProMutation: () => [action(subscribe), { isLoading: false }] } });
  const { useProfileSubscriptionCheckout } = app.load('hooks/profile/useProfileSubscriptionCheckout.ts');
  const props = {
    clearStoredSubscriptionPayment: async () => {}, readStoredSubscriptionPayment: async () => null,
    closeIfPremiumAlreadyActive: async () => false, finishSubscriptionPayment: async () => false,
    persistStoredSubscriptionPayment: async () => {}, stopSubscriptionPaymentAutoCheck() {},
    startSubscriptionPaymentAutoCheck() {}, scheduleDeferredSubscriptionSync() {},
    resumeExistingSubscriptionPayment: async () => {}, restoreRecentPendingSubscriptionPayment: async () => null,
    isCheckingSubscriptionPayment: false,
  };
  return { ...app, props, render: () => app.hooks.render(() => {
    const state = app.stateHook({ currentUser: { phone: '0991234567' } });
    return useProfileSubscriptionCheckout({ ...state, ...props, subscriptionPhone: '+243991234567' });
  }) };
}

test('restoring an order does not change the backend refresh callback or crash before the user loads', async () => {
  const app = paymentEnvironment();
  const { useProfileSubscriptionRecovery } = app.load('hooks/profile/useProfileSubscriptionRecovery.ts');
  const props = {
    currentUser: null, isDriver: false,
    clearStoredSubscriptionPayment: async () => {}, readStoredSubscriptionPayment: async () => null,
    persistStoredSubscriptionPayment: async () => {},
    checkSubscriptionPaymentByOrderNumber: async () => 'pending',
    stopSubscriptionPaymentAutoCheck() {}, startSubscriptionPaymentAutoCheck() {},
    refetchPaymentHistory: () => ({ unwrap: async () => [] }),
    refetchPremiumOverview: () => ({ unwrap: async () => ({ isPremium: false }) }),
    refetchProfile: async () => ({}), openCardPaymentUrl: async () => {},
  };
  const render = () => app.hooks.render(() => {
    const state = app.stateHook({ currentUser: null });
    return { ...state, ...useProfileSubscriptionRecovery({ ...state, ...props }) };
  });
  const initial = render();
  assert.equal(await initial.restoreRecentPendingSubscriptionPayment(), null);
  initial.setSubscriptionPaymentOrderNumber('restored');
  assert.equal(render().refreshSubscriptionFromBackend, initial.refreshSubscriptionFromBackend);
  app.hooks.unmount();
});

test('checkout resumes an existing backend reference without starting another payment', async () => {
  let starts = 0, resumes = 0;
  const app = checkoutEnvironment(async () => { starts++; });
  app.props.subscriptionPaymentOrderNumber = 'existing';
  app.props.recentPendingSubscriptionOrderNumber = 'existing';
  app.props.resumeExistingSubscriptionPayment = async () => { resumes++; };
  await app.render().handleSubmitSubscriptionPayment();
  assert.equal(starts, 0);
  assert.equal(resumes, 1);
  app.hooks.unmount();
});

test('checkout reconciles an ambiguous response and follows the recovered order without a second POST', async () => {
  let starts = 0;
  const monitored = [];
  const app = checkoutEnvironment(async () => { starts++; throw { status: 'TIMEOUT_ERROR' }; });
  app.props.restoreRecentPendingSubscriptionPayment = async () => ({ orderNumber: 'recovered' });
  app.props.startSubscriptionPaymentAutoCheck = (order) => monitored.push(order);
  await app.render().handleSubmitSubscriptionPayment();
  assert.equal(starts, 1);
  assert.deepEqual(monitored, ['recovered']);
  app.hooks.unmount();
});
