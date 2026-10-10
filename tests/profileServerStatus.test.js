const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { profileState } = require('./helpers/profileStateFixture.cjs');

const load = loader({ '@react-native-async-storage/async-storage': {} });
const { mapProfileSummary, mapServerUser } = load('store/api/user/profileMapper.ts');
const { getProfileStatus, getProfilePriorityAction } = load('features/profile/profileStatusModel.ts');
const rawProfile = (role = 'driver', documents = [{ status: 'approved' }]) => ({
  user: { id: 'account', role, kycDocuments: documents, isPremium: false },
  stats: { vehicles: 1, tripsAsDriver: 4, bookingsAsPassenger: 0, bookingsAsDriver: 2, messagesSent: 0 },
});

test('profile identity distinguishes absent data, confirmed absence and unfinished Didit verification', () => {
  const raw = rawProfile();
  delete raw.user.kycDocuments;
  let status = getProfileStatus(mapProfileSummary(raw), 'account');
  assert.equal(status.isIdentityStatusKnown, false);
  assert.equal(status.isKycApproved, false);
  assert.equal(status.needsDriverOnboarding, false, 'unknown identity does not mean onboarding is incomplete');
  for (const documents of [[], [{ status: 'pending', provider: 'didit', diditSessionStatus: 'Not Started' }]]) {
    status = getProfileStatus(mapProfileSummary(rawProfile('passenger', documents)), 'account');
    assert.equal(status.isIdentityStatusKnown, true);
    assert.equal(status.isKycApproved, false);
    assert.equal(status.isKycPending, false);
  }
  for (const documents of [null, {}, [{ status: 'unexpected' }], [{ status: 'approved', userId: 'other' }]]) {
    assert.equal(getProfileStatus(mapProfileSummary(rawProfile('driver', documents)), 'account').isIdentityStatusKnown, false);
  }
});

test('identity follows the latest server document with the same ordering as driver activation', () => {
  const documents = [
    { id: 'a', status: 'approved', createdAt: '2026-09-20T00:00:00Z', cniFrontUrl: 'private-file' },
    { id: 'b', status: 'pending', createdAt: '2026-09-21T00:00:00Z' },
    { id: 'c', status: 'rejected', createdAt: '2026-09-21T00:00:00Z', rejectionReason: 'À reprendre', providerMetadata: {} },
  ];
  const original = documents.slice();
  const raw = rawProfile('driver', documents);
  const snapshot = mapProfileSummary(raw);
  assert.equal(snapshot.identity.status, 'rejected');
  assert.equal(snapshot.identity.rejectionReason, 'À reprendre');
  assert.equal(snapshot.user.identityVerified, false);
  assert.equal(mapServerUser(raw.user).identityVerified, false);
  assert.equal(getProfileStatus(snapshot, 'account').isKycRejected, true);
  assert.deepEqual(Object.keys(snapshot.identity).sort(), ['diditSessionStatus', 'provider', 'rejectionReason', 'status']);
  assert.deepEqual(documents, original, 'sorting does not mutate the response');
});

test('a vehicle or a legacy flag cannot activate a passenger and another account snapshot is ignored', () => {
  const raw = rawProfile('passenger');
  raw.user.isDriver = true;
  raw.user.vehicles = [{ id: 'vehicle' }];
  const snapshot = mapProfileSummary(raw);
  assert.equal(getProfileStatus(snapshot, 'account').isDriver, false);
  assert.equal(getProfileStatus(snapshot, 'account').isKycApproved, true, 'verified passengers remain passengers');
  for (const id of [undefined, '', 'other']) {
    const status = getProfileStatus(snapshot, id);
    assert.equal(status.currentUser, undefined);
    assert.equal(status.isProfileStatusKnown, false);
    assert.equal(status.isIdentityStatusKnown, false);
    assert.equal(status.isDriver, false);
    assert.equal(status.needsDriverOnboarding, false);
  }
});

test('priority actions follow the server contract, not separately loaded flags', () => {
  assert.equal(getProfilePriorityAction({ isProfileStatusAvailable: false, isDriver: false }), 'refresh');
  assert.equal(getProfilePriorityAction({ isProfileStatusAvailable: true, isDriver: true }), 'refresh');
  for (const action of ['start', 'verify_identity', 'add_vehicle', 'wait', 'activate']) {
    assert.equal(getProfilePriorityAction({ profileState: profileState(action), isDriver: true,
      isKycApproved: true, hasVehicle: true, isProfileStatusAvailable: false }), 'onboarding');
  }
  assert.equal(getProfilePriorityAction({ profileState: profileState('contact_support') }), 'support');
  assert.equal(getProfilePriorityAction({ profileState: profileState('none') }), 'pro');
  assert.equal(getProfilePriorityAction({ profileState: profileState('none'), isPremiumActive: true }), 'wallet');
});

test('server identity, eligibility and active vehicle count supersede raw relations and aggregate counts', () => {
  const raw = { ...rawProfile(), profileState: profileState('add_vehicle', { identity: { status: 'pending' } }) };
  const snapshot = getProfileStatus(mapProfileSummary(raw), 'account');
  assert.equal(snapshot.isKycPending, true);
  assert.equal(snapshot.isKycApproved, false);
  assert.equal(snapshot.profileVehicleCount, 0);
  assert.equal(snapshot.profileRoleLabel, 'Profil conducteur à compléter');
  assert.equal(snapshot.needsDriverOnboarding, true);
  assert.equal(getProfileStatus(mapProfileSummary({ ...raw, profileState: profileState() }), 'account').profileRoleLabel, 'Conducteur');
});

test('unknown versions, malformed counts and other account contracts are ignored', () => {
  for (const value of [undefined, {}, profileState('none', { version: 2 }), profileState('none', { userId: 'other' }),
    profileState('none', { driver: { activeVehicleCount: -1 } }), profileState('none', { driver: { activeVehicleCount: 1.5 } }),
    profileState('none', { driver: { nextAction: 'new_server_action' } })]) {
    assert.equal(mapProfileSummary({ ...rawProfile(), profileState: value }).profileState, undefined);
  }
});

function profileFixture() {
  const hooks = hookHarness(), calls = [], refreshes = [];
  const state = { user: { id: 'account', role: 'driver', identityVerified: true }, active: true };
  const values = { profile: { data: undefined, isLoading: true, isFetching: true },
    vehicles: { data: undefined, isError: true }, plans: { data: [] }, requests: { data: [] },
    offers: { data: [] }, reviews: { data: [] } };
  const query = name => (_arg, options) => {
    calls.push({ name, options });
    return { isLoading: false, isFetching: false, isError: false, ...values[name],
      refetch: async () => { refreshes.push(name); return values[name]; } };
  };
  const refresh = name => async () => { refreshes.push(name); return values[name]; };
  const { useProfileData } = loader({
    react: hooks.react, 'react-native': { Linking: {} },
    'expo-linking': { createURL: path => path }, 'expo-web-browser': { maybeCompleteAuthSession() {} },
    '@/store/hooks': { useAppSelector: () => state.user },
    '@/store/selectors': { selectUser: () => state.user },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    './useProfileRefresh': { useProfileRefresh: () => ({
      refetchProfile: refresh('profile'), refetchKycStatus: refresh('kyc'),
      refetchVehicles: refresh('vehicles'), refetchReferralSummary: refresh('referrals'),
      refetchDriverSettlement: refresh('settlements'),
    }) },
    '@/store/api/userApi': { useGetProfileSummaryQuery: query('profile'),
      useGetKycStatusQuery: () => { throw new Error('No independent identity read in profile'); } },
    '@/store/api/vehicleApi': { useGetVehiclesQuery: query('vehicles') },
    '@/store/api/referralApi': { useGetMyReferralSummaryQuery: query('referrals') },
    '@/store/api/driverSettlementsApi': { useGetMyDriverSettlementQuery: query('settlements') },
    '@/store/api/paymentApi': { useGetPendingSubscriptionPaymentsQuery: query('payments') },
    '@/store/api/subscriptionApi': { useGetSubscriptionPlansQuery: query('plans'), useGetPremiumOverviewQuery: query('premium') },
    '@/store/api/reviewApi': { useGetReviewPageQuery: query('reviews'), useGetAverageRatingQuery: query('rating') },
    '@/store/api/tripRequestApi': { useGetMyTripRequestsQuery: query('requests'), useGetMyDriverOffersQuery: query('offers') },
  })('hooks/profile/useProfileData.ts');
  return { hooks, state, values, calls, refreshes, render: () => hooks.render(useProfileData) };
}

test('slow first load and first-load failure never use a locally remembered driver role or identity', async () => {
  const app = profileFixture();
  let profile = app.render();
  assert.equal(profile.isProfileDataLoading, true);
  assert.equal(profile.isProfileStatusKnown, false);
  assert.equal(profile.currentUser, undefined);
  assert.equal(profile.isDriver, false);
  assert.equal(profile.isKycApproved, false);
  app.values.profile = { isError: true };
  profile = app.render();
  assert.equal(profile.isProfileDataLoading, false);
  assert.equal(profile.isProfileStatusAvailable, false);
  assert.equal(getProfilePriorityAction(profile), 'refresh');
  await profile.handleRefresh();
  assert.deepEqual(app.refreshes.sort(), ['kyc', 'profile', 'referrals', 'vehicles']);
  app.hooks.unmount();
});

test('cached server driver status survives failed refreshes and vehicle reads; recovery replaces it atomically', () => {
  const app = profileFixture();
  const snapshot = mapProfileSummary({ ...rawProfile(), profileState: profileState() });
  app.values.profile = { data: snapshot };
  let profile = app.render();
  assert.equal(profile.isDriver, true);
  assert.equal(profile.isKycApproved, true);
  assert.equal(profile.hasVehicle, true);
  assert.equal(profile.needsDriverOnboarding, false);
  assert.equal(getProfilePriorityAction(profile), 'pro');
  app.values.profile = { data: snapshot, isError: true };
  profile = app.render();
  assert.equal(profile.currentUser, snapshot.user);
  assert.equal(profile.displaysDriverRole, true);
  assert.equal(profile.isKycApproved, true);
  assert.equal(profile.needsDriverOnboarding, false);
  assert.equal(profile.hasProfileLoadError, true);
  assert.equal(profile.isProfileStatusAvailable, true, 'cached contract stays visible; actions revalidate on press');
  assert.equal(getProfilePriorityAction(profile), 'pro');
  app.values.profile = { data: mapProfileSummary({ ...rawProfile('passenger', [{ status: 'pending' }]),
    profileState: profileState('wait') }) };
  profile = app.render();
  assert.equal(profile.displaysDriverRole, false, 'server role supersedes the stale auth role');
  assert.equal(profile.isKycApproved, false);
  assert.equal(profile.isKycPending, true);
  assert.equal(profile.isProfileStatusAvailable, true);
  assert.equal(getProfilePriorityAction(profile), 'onboarding');
  app.state.user = { id: 'different-account', role: 'driver' };
  profile = app.render();
  assert.equal(profile.isProfileStatusKnown, false);
  assert.equal(profile.currentUser, undefined);
  app.hooks.unmount();
});

test('missing identity or vehicle count never creates a new verification/vehicle requirement', () => {
  const app = profileFixture();
  const raw = rawProfile();
  delete raw.user.kycDocuments;
  delete raw.stats.vehicles;
  app.values.profile = { data: mapProfileSummary(raw) };
  const profile = app.render();
  assert.equal(profile.isDriver, true);
  assert.equal(profile.isIdentityStatusKnown, false);
  assert.equal(profile.knownVehicleCount, undefined);
  assert.equal(profile.needsDriverOnboarding, false);
  assert.equal(getProfilePriorityAction(profile), 'refresh');
  app.hooks.unmount();
});

test('real RTK Query retains one coherent server snapshot after a 503 and replaces it after recovery', async t => {
  let response = rawProfile(), fail = false;
  const { buildGetProfileSummaryEndpoints } = load('store/api/user/getProfileSummary.endpoints.ts');
  const api = createApi({ reducerPath: 'profileTest', tagTypes: ['User', 'KycStatus', 'Vehicle', 'FavoriteLocations'],
    baseQuery: async () => fail ? { error: { status: 503 } } : { data: response },
    endpoints: buildGetProfileSummaryEndpoints,
  });
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer,
    auth: () => ({ user: { id: 'account', role: 'driver' } }) }, middleware: get => get().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  const read = () => store.dispatch(api.endpoints.getProfileSummary.initiate(undefined, { subscribe: false, forceRefetch: true }));
  const select = () => api.endpoints.getProfileSummary.select()(store.getState());
  await read();
  const first = select().data;
  fail = true;
  await read();
  assert.equal(select().isError, true);
  assert.equal(select().data, first);
  assert.equal(getProfileStatus(select().data, 'account').isKycApproved, true);
  fail = false; response = rawProfile('passenger', []);
  await read();
  const fresh = getProfileStatus(select().data, 'account');
  assert.equal(fresh.displaysDriverRole, false);
  assert.equal(fresh.isIdentityStatusKnown, true);
  assert.equal(fresh.isKycApproved, false);
});
