const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { profileState } = require('./helpers/profileStateFixture.cjs');
const native = {
  View: 'View', Text: 'Text', TouchableOpacity: 'Button', Image: 'Image',
  ActivityIndicator: 'Spinner', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl',
  StyleSheet: { create: value => value },
};
const mocks = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } };
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree) ? text(tree.props.children) : '';

test('identity badge and identity action use the same confirmed status instead of legacy user flags', () => {
  const load = loader(mocks);
  const { ProfileHeader } = load('components/profile/ProfileHeader.tsx');
  const { ProfileIdentitySection } = load('components/profile/ProfileIdentitySection.tsx');
  for (const approved of [true, false]) {
    const tree = ProfileHeader({ currentUser: { identityVerified: !approved }, isKycApproved: approved, displaysDriverRole: true, profileRoleLabel: 'Conducteur' });
    assert.equal(nodes(tree).some(node => node.type === 'Icon' && node.props.name === 'checkmark-sharp'), approved);
    assert.match(text(tree), /Conducteur/);
    const identity = ProfileIdentitySection.type({ approved, known: true, pending: false, rejected: false });
    assert.match(text(identity), approved ? /Identité vérifiée/ : /Identité non vérifiée/);
    if (approved) assert.doesNotMatch(text(identity), /Vérifier mon identité/);
  }
  const unknown = ProfileIdentitySection.type({ known: false, approved: false, pending: false, rejected: false });
  assert.match(text(unknown), /Statut d’identité indisponible/);
  assert.match(text(unknown), /Actualiser le statut/);
  assert.doesNotMatch(text(unknown), /Identité non vérifiée|Vérifier mon identité/);
});

test('status notice labels the last server snapshot and provides retry without forcing logout', () => {
  const { ProfileStatusNotice } = loader(mocks)('components/profile/ProfileStatusNotice.tsx');
  const calls = [];
  for (const hasSnapshot of [true, false]) {
    const tree = ProfileStatusNotice({ hasSnapshot, busy: false,
      onRetry: () => calls.push('retry'), onLogout: hasSnapshot ? undefined : () => calls.push('logout') });
    assert.match(text(tree), hasSnapshot ? /Dernier statut conservé/ : /Impossible de confirmer votre statut/);
    assert.doesNotMatch(text(tree), /Devenir conducteur|Vérifier mon identité/);
    const buttons = nodes(tree).filter(node => node.type === 'Button');
    assert.equal(buttons.length, hasSnapshot ? 1 : 2);
    buttons[0].props.onPress();
    assert.equal(calls.at(-1), 'retry');
  }
  const loading = ProfileStatusNotice({ hasSnapshot: false, busy: true });
  assert.equal(nodes(loading).find(node => node.type === 'Button').props.disabled, true);
});

test('without a matching server profile the screen renders neither badges nor onboarding actions', () => {
  const profile = { isProfileDataLoading: false, isProfileStatusKnown: false, insets: {},
    vehicleModalCopy: {}, vehicleModalVisible: false, hasVehicle: false };
  const childNames = ['ProfileHeader', 'ProfileStatusNotice', 'ProfileDashboard', 'ProfileDocumentsCard',
    'ProfileMenu', 'ProfilePinModal', 'ProfileProCard', 'ProfileReferralCard', 'ProfileReviewsModal',
    'ProfileReviewsSection', 'ProfileSubscriptionModal', 'ProfileVehiclesSection'];
  const childMocks = Object.fromEntries(childNames.map(name => [`@/components/profile/${name}`, { [name]: name }]));
  const Screen = loader({ ...mocks, ...childMocks,
    'react-native-safe-area-context': { SafeAreaView: 'View' },
    '@/components/TutorialOverlay': { TutorialOverlay: 'Tutorial' },
    '@/components/VehicleFormModal': { VehicleFormModal: 'VehicleModal' },
    '@/hooks/profile/useProfileController': { useProfileController: () => profile },
  })('app/(tabs)/profile.tsx').default;
  const tree = nodes(Screen());
  assert.ok(tree.some(node => node.type === 'ProfileStatusNotice' && node.props.hasSnapshot === false));
  assert.ok(!tree.some(node => ['ProfileHeader', 'ProfileDashboard', 'ProfileProCard'].includes(node.type)));
  profile.isProfileDataLoading = true;
  const loading = nodes(Screen());
  assert.ok(loading.some(node => node.type === 'Spinner'));
  assert.ok(!loading.some(node => node.type === 'ProfileHeader'));
});

test('controller never labels an existing driver as becoming a driver and retry does not mutate the account', async () => {
  const hooks = hookHarness(), calls = [];
  const data = { isDriver: true, isKycApproved: true, isProfileStatusKnown: true, isIdentityStatusKnown: true,
    isProfileStatusAvailable: false, hasVehicle: true, knownVehicleCount: 1, isPremiumActive: false,
    needsDriverOnboarding: false, tripRequestsStats: { activeRequests: 0 },
    handleRefresh: async () => calls.push('refresh'), refetchProfile: async () => calls.push('read'),
  };
  const stubHook = (name, value = {}) => [`./${name}`, { [name]: () => value }];
  const hookMocks = Object.fromEntries([
    stubHook('useProfileData', data), stubHook('useProfileVehicles', { openCreateVehicleModal: () => calls.push('vehicle') }),
    stubHook('useProfilePin'), stubHook('useProfileOnboarding', {
      handleStartDriverOnboarding: () => calls.push('onboarding'), handleOpenKycModal: () => calls.push('identity'),
    }),
    ...['Card', 'Checkout', 'Lifecycle', 'Monitor', 'Recovery', 'State', 'Storage', 'View'].map(suffix => stubHook(`useProfileSubscription${suffix}`)),
  ]);
  const { useProfileController } = loader({ ...mocks, ...hookMocks, react: hooks.react,
    'expo-router': { useRouter: () => ({ push: route => calls.push(route) }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({}) },
    '@/components/ui/DialogProvider': { useDialog: () => ({}) },
    '@/contexts/TutorialContext': { useTutorialGuide: () => ({ shouldShow: false }) },
    '@/hooks/useProfilePhoto': { useProfilePhoto: () => ({}) },
    '@/store/hooks': { useAppDispatch: () => () => {}, useAppSelector: () => true },
    '@/store/slices/authSlice': {},
    '@/features/profile/profileModel': { formatReferralTokens: () => '0' },
  })('hooks/profile/useProfileController.ts');
  const render = () => hooks.render(useProfileController);
  assert.equal(render().priorityCta.label, 'Actualiser le profil');
  await render().priorityCta.onPress();
  await render().handleSubscribePro();
  assert.deepEqual(calls, ['refresh', 'read']);
  data.isProfileStatusAvailable = true;
  data.profileState = profileState();
  assert.equal(render().priorityCta.label, 'Activer Pro');
  data.hasVehicle = false; data.needsDriverOnboarding = true;
  data.profileState = profileState('add_vehicle');
  assert.equal(render().priorityCta.label, 'Ajouter un véhicule');
  data.isKycApproved = false;
  data.profileState = profileState('verify_identity');
  assert.equal(render().priorityCta.label, 'Vérifier mon identité');
  data.isDriver = false;
  data.profileState = profileState('start');
  assert.equal(render().priorityCta.label, 'Commencer');
  hooks.unmount();
});

test('each driver journey step has one accessible primary action and explicit prerequisites', () => {
  const { ProfileDriverJourney } = loader(mocks)('components/profile/ProfileDriverJourney.tsx');
  for (const action of ['start', 'verify_identity', 'add_vehicle', 'wait', 'activate', 'contact_support']) {
    let clicks = 0;
    const tree = ProfileDriverJourney({ state: profileState(action), busy: false, onContinue: () => clicks++ });
    const buttons = nodes(tree).filter(node => node.type === 'Button');
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].props.accessibilityRole, 'button');
    buttons[0].props.onPress();
    assert.equal(clicks, 1);
    if (action !== 'start') assert.doesNotMatch(text(tree), /Devenir conducteur/);
    if (action === 'wait') assert.match(text(tree), /Aucun nouveau document/);
  }
  const pending = ProfileDriverJourney({ state: profileState('add_vehicle', { identity: { status: 'pending' } }), busy: true });
  assert.match(text(pending), /pendant ce temps/);
  assert.equal(nodes(pending).find(node => node.type === 'Button').props.disabled, true);
});

test('ongoing driver journeys replace competing verification and dashboard CTAs', () => {
  const { ProfileDashboard } = loader({ ...mocks,
    '@/utils/reanimated': { default: { View: 'AnimatedView' }, FadeInDown: { delay: () => ({}) } },
    './ProfileDriverJourney': { ProfileDriverJourney: 'Journey' },
    './ProfileIdentitySection': { ProfileIdentitySection: 'Identity' },
  })('components/profile/ProfileDashboard.tsx');
  for (const action of ['verify_identity', 'add_vehicle', 'wait', 'activate', 'contact_support']) {
    const tree = ProfileDashboard({ profileState: profileState(action), driverStatusItems: [], quickActionItems: [],
      priorityCta: { label: 'Must not render' }, isKycRejected: true, kycStatus: { rejectionReason: 'Reason' } });
    assert.equal(nodes(tree).filter(node => node.type === 'Journey').length, 1);
    assert.ok(!nodes(tree).some(node => node.type === 'Identity'));
    assert.doesNotMatch(text(tree), /Must not render|Reason/);
  }
});
