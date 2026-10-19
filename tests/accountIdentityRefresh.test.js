const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { profileState } = require('./helpers/profileStateFixture.cjs');
const snapshot = loader()('features/identity/accountIdentitySnapshot.ts').accountIdentitySnapshot;
const profile = (action = 'none', time = 20) => ({ fulfilledTimeStamp: time,
  data: { user: { id: 'account', role: 'driver' }, profileState: profileState(action) } });
const kyc = (status = 'pending', time = 10, userId = 'account') => ({ fulfilledTimeStamp: time, data: { userId, status } });

test('manual server approval supersedes old KYC cache; an old driver/JWT flag never grants identity', () => {
  assert.equal(snapshot('account', profile(), kyc()).approved, true);
  assert.equal(snapshot('account', {}, { data: null }).known, true);
  assert.equal(snapshot('account', {}, { data: null }).document, null);
  const unknown = snapshot('account', { data: { user: { id: 'account', role: 'driver', identityVerified: true } } }, {});
  assert.equal(unknown.known, false); assert.equal(unknown.approved, false);
  assert.equal(snapshot('other', profile(), kyc('approved')).approved, false);
  assert.equal(snapshot(undefined, profile(), kyc('approved')).known, false);
});

test('latest negative result replaces approval; legacy KYC and profile absence remain supported', () => {
  assert.equal(snapshot('account', profile(), kyc('rejected', 30)).approved, false);
  assert.equal(snapshot('account', profile('wait', 40), kyc('approved', 30)).approved, false);
  assert.equal(snapshot('account', {}, kyc('approved')).approved, true);
  assert.equal(snapshot('account', profile('verify_identity', 40), kyc('approved', 30)).status, null);
  assert.equal(snapshot('account', {}, { data: { ...kyc().data, provider: 'didit', diditSessionStatus: 'Not Started' } }).status, null);
});

function statusFixture() {
  const hooks = hookHarness(), calls = [], refreshes = [];
  const state = { user: { id: 'account' }, authenticated: true, active: true, version: 0 };
  const reads = { profile: profile(), kyc: kyc() };
  const refetch = name => async () => { refreshes.push(name); return reads[name]; };
  const profileRefetch = refetch('profile'), kycRefetch = refetch('kyc');
  const query = name => (_arg, options) => {
    calls.push({ name, options });
    return { isFetching: false, isError: false, isUninitialized: false,
      refetch: name === 'profile' ? profileRefetch : kycRefetch, ...reads[name] };
  };
  const { useAccountIdentityStatus } = loader({ react: hooks.react,
    '@/store/hooks': { useAppSelector: selector => selector(state) },
    '@/store/selectors': { selectUser: s => s.user, selectHasAuthenticatedSession: s => s.authenticated },
    '@/hooks/useAppIsActive': { useAppIsActive: () => state.active },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
    '@/store/api/userApi': { useGetProfileSummaryQuery: query('profile'), useGetKycStatusQuery: query('kyc') },
  })('hooks/identity/useAccountIdentityStatus.ts');
  return { hooks, calls, refreshes, state, reads, render: () => hooks.render(useAccountIdentityStatus) };
}

test('shared identity reads resume only while authenticated/foreground, are bounded by cache and never poll', async () => {
  const f = statusFixture(); const first = f.render();
  assert.equal(first.isIdentityVerified, true);
  assert.equal(f.render(), first, 'unchanged snapshots keep the context value stable');
  for (const { options } of f.calls) {
    assert.equal(options.skip, false); assert.equal(options.pollingInterval, 0);
    assert.equal(options.refetchOnMountOrArgChange, 30); assert.equal(options.refetchOnFocus, false);
    assert.equal(options.refetchOnReconnect, true);
  }
  f.state.active = false; f.render();
  assert.ok(f.calls.slice(-2).every(call => call.options.skip));
  await first.refreshKycStatus(); assert.deepEqual(f.refreshes, []);
  f.state.active = true; const resumed = f.render();
  await resumed.refreshKycStatus(); assert.deepEqual(f.refreshes, ['profile', 'kyc']);
  f.state.authenticated = false;
  assert.equal(f.render().isIdentityVerified, false);
  assert.ok(f.calls.slice(-2).every(call => call.options.skip));
  f.hooks.unmount();
  await resumed.refreshKycStatus(); assert.equal(f.refreshes.length, 2);
});

test('slow or unavailable identity is distinct from rejected KYC; a new account cannot reuse the previous snapshot', () => {
  const f = statusFixture(); f.reads.profile = { isFetching: true }; f.reads.kyc = { isFetching: true };
  let result = f.render(); assert.equal(result.isChecking, true); assert.equal(result.isIdentityStatusKnown, false);
  f.reads.profile = { isError: true }; f.reads.kyc = { isError: true };
  result = f.render(); assert.equal(result.hasIdentityReadError, true); assert.equal(result.isIdentityVerified, false);
  f.reads.profile = profile(); f.reads.kyc = kyc('approved'); f.state.user = { id: 'other' }; f.state.version++;
  assert.equal(f.render().isIdentityStatusKnown, false); f.hooks.unmount();
});

test('RTK entry/resume shares actual profile/KYC endpoints, picks up admin changes and leaves no extra subscriptions', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const calls = [], state = { approved: false };
  const { buildGetProfileSummaryEndpoints } = loader({
    '@react-native-async-storage/async-storage': {},
    '@/services/tokenSession': { getTokenSessionVersion: () => 0 },
  })('store/api/user/getProfileSummary.endpoints.ts');
  const api = createApi({ reducerPath: 'identity', tagTypes: ['User', 'KycStatus', 'Vehicle', 'FavoriteLocations'],
    baseQuery: async url => {
      calls.push(url);
      const status = state.approved ? 'approved' : 'pending';
      return { data: url === '/users/me' ? { user: { id: 'account', role: 'driver', kycDocuments: [{ status }] }, stats: {} }
        : { userId: 'account', status } };
    }, endpoints: buildGetProfileSummaryEndpoints });
  const store = configureStore({ reducer: { identity: api.reducer, auth: () => ({ user: { id: 'account' } }) },
    middleware: get => get().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  const enter = () => ['getProfileSummary', 'getKycStatus'].map(name =>
    store.dispatch(api.endpoints[name].initiate(undefined, { forceRefetch: 30,
      subscriptionOptions: { refetchOnReconnect: true, refetchOnFocus: false } })));
  const initial = enter();
  const concurrent = store.dispatch(api.endpoints.getProfileSummary.initiate(undefined, { forceRefetch: 30 }));
  await Promise.all([...initial, concurrent]);
  assert.deepEqual(calls, ['/users/me', '/users/kyc/status']);
  initial.forEach(request => request.unsubscribe()); concurrent.unsubscribe();
  t.mock.timers.tick(10000); const quick = enter(); await Promise.all(quick);
  assert.equal(calls.length, 2); quick.forEach(request => request.unsubscribe());
  state.approved = true; t.mock.timers.tick(30000);
  const resumed = enter(); await Promise.all(resumed);
  const read = name => api.endpoints[name].select()(store.getState());
  assert.equal(snapshot('account', read('getProfileSummary'), read('getKycStatus')).approved, true);
  assert.equal(calls.length, 4);
  state.approved = false;
  store.dispatch(api.internalActions.onOffline()); store.dispatch(api.internalActions.onOnline());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 6);
  assert.equal(snapshot('account', read('getProfileSummary'), read('getKycStatus')).approved, false);
  resumed.forEach(request => request.unsubscribe());
  const subscriptions = store.dispatch(api.internalActions.internal_getRTKQSubscriptions());
  assert.equal(subscriptions.getSubscriptionCount('getProfileSummary(undefined)'), 0);
  assert.equal(subscriptions.getSubscriptionCount('getKycStatus(undefined)'), 0);
});

test('identity guard does not send a loading/offline user back through KYC', () => {
  const hooks = hookHarness(), dialogs = [];
  let identity = { isIdentityVerified: false, isChecking: true, isIdentityStatusKnown: false, refreshKycStatus: async () => {} };
  const { IdentityProvider } = loader({ react: { ...React, ...hooks.react },
    'expo-router': { useRouter: () => ({ push() {} }) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: dialog => dialogs.push(dialog) }) },
    '@/hooks/identity/useAccountIdentityStatus': { useAccountIdentityStatus: () => identity },
  })('contexts/IdentityContext.tsx');
  const render = () => hooks.render(() => IdentityProvider({ children: null })).props.value;
  assert.equal(render().checkIdentity('publish'), false);
  assert.match(dialogs.at(-1).title, /Mise à jour/);
  identity = { ...identity, isChecking: false, hasIdentityReadError: true };
  render().checkIdentity('publish'); assert.match(dialogs.at(-1).title, /indisponible/);
  assert.deepEqual(dialogs.at(-1).actions.map(action => action.label), ['Réessayer']);
  identity = { ...identity, isIdentityVerified: true, isIdentityStatusKnown: true, hasIdentityReadError: false };
  assert.equal(render().checkIdentity('publish'), true); assert.equal(dialogs.length, 2);
  identity = { ...identity, isIdentityVerified: false };
  render().checkIdentity('publish'); assert.match(dialogs.at(-1).title, /Identité vérifiée requise/);
  hooks.unmount();
});

test('publication closes obsolete KYC prompt after admin approval and does not retain a local approval after revocation', async () => {
  const hooks = hookHarness(); let launches = 0, checks = 0;
  let identity = { isIdentityVerified: false, isChecking: false, isIdentityStatusKnown: true, hasIdentityReadError: false,
    refreshKycStatus: async () => {}, checkIdentity: () => { checks++; return false; } };
  const { usePublishIdentity } = loader({ react: hooks.react,
    '@/hooks/useIdentityCheck': { useIdentityCheck: () => identity },
    '@/hooks/useDiditKycFlow': { useDiditKycFlow: () => ({ startDiditKyc: async () => { launches++; }, isStartingDiditKyc: false }) },
  })('hooks/publish/usePublishIdentity.ts');
  const render = () => hooks.render(usePublishIdentity);
  render().openKycModal(); assert.equal(render().kycModalVisible, true);
  identity = { ...identity, isIdentityVerified: true };
  assert.equal(render().kycModalVisible, false); await render().startDiditKyc(); assert.equal(launches, 0);
  identity = { ...identity, isIdentityVerified: false, isChecking: true };
  render().openKycModal(); await render().startDiditKyc();
  assert.equal(render().kycModalVisible, false); assert.equal(launches, 0); assert.equal(checks, 2);
  identity = { ...identity, isChecking: false };
  assert.equal(render().isPublishIdentityVerified, false);
  await render().startDiditKyc(); assert.equal(launches, 1); hooks.unmount();
});

test('publication banner distinguishes loading, unavailable and approved without launching KYC during refresh', () => {
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes)
    : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
  const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('')
    : React.isValidElement(tree) ? text(tree.props.children) : '';
  const { PublishRouteStep } = loader({
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'ScrollView' },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/constants/styles': { Colors: { primary: 'orange', gray: { 500: 'gray' } } },
    '@/utils/reanimated': { __esModule: true, default: { View: 'View' } },
    '../screen-styles/app/publish/index': { styles: {} }, './PublishRouteFields': { PublishRouteFields: 'Fields' },
  })('features/publish/PublishRouteStep.tsx');
  let retries = 0;
  const props = { isPublishIdentityVerified: false, refreshIdentity: () => retries++, showQuickLandmarks: false };
  const loading = PublishRouteStep({ ...props, isCheckingIdentity: true });
  assert.match(text(loading), /Mise à jour de votre profil/);
  assert.doesNotMatch(text(loading), /Vérifiez votre identité pour publier/);
  assert.equal(nodes(loading).find(node => node.type === 'Button' && node.props.accessibilityRole === 'button').props.disabled, true);
  const unavailable = PublishRouteStep({ ...props, isIdentityStatusUnavailable: true });
  nodes(unavailable).find(node => node.type === 'Button' && node.props.accessibilityRole === 'button').props.onPress();
  assert.equal(retries, 1); assert.doesNotMatch(text(unavailable), /Vérifiez votre identité pour publier/);
  assert.doesNotMatch(text(PublishRouteStep({ ...props, isPublishIdentityVerified: true })), /identité|statut|validation/i);
});
