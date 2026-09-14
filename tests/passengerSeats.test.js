const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const load = loader();
const { getPassengerSeatValidation, getPassengerVehicleSeatCapacity } = load('utils/passengerSeats.ts');
const { getApiErrorMessage } = load('utils/errorHelpers.ts');

test('backend threshold is three seats, approved passengers are only capped by capacity', () => {
  for (const seats of [1, 2]) assert.equal(getPassengerSeatValidation(seats, false, 8), null);
  for (const seats of [3, 4, 8]) {
    assert.equal(getPassengerSeatValidation(seats, false, 8).reason, 'identity');
    assert.equal(getPassengerSeatValidation(seats, true, 8), null);
  }
  assert.equal(getPassengerSeatValidation(9, true, 8).reason, 'capacity');
  assert.equal(getPassengerSeatValidation(1, true, 0).reason, 'capacity');
  assert.equal(getPassengerSeatValidation(20, true), null);
});

test('motorcycle capacities do not change after identity approval; invalid counts never pass', () => {
  assert.equal(getPassengerVehicleSeatCapacity('car'), null);
  for (const type of ['moto', 'motorcycle_2_wheels']) assert.equal(getPassengerVehicleSeatCapacity(type), 2);
  for (const type of ['tricycle', 'motorcycle_3_wheels']) assert.equal(getPassengerVehicleSeatCapacity(type), 3);
  for (const count of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(getPassengerSeatValidation(count, true).reason, 'invalid');
  }
});

test('server extra-seat errors explain identity verification, without technical terminology', () => {
  const message = getApiErrorMessage({ status: 400, data: { code: 'PASSENGER_KYC_REQUIRED', reason: 'extra_seats', message: 'Votre KYC doit être approuvé.' } }, 'Erreur');
  assert.match(message, /3 places/);
  assert.match(message, /Aucun véhicule/);
  assert.doesNotMatch(message, /kyc/i);
});

const native = { View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: value => value } };
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree) ? text(tree.props.children) : '';

test('request seat control goes past two, respects motorcycle capacity and preserves total cost', () => {
  const model = load('features/trip-request/requestFormModel.ts');
  assert.equal(model.clampRequestSeats(5), 5);
  assert.equal(model.clampRequestSeats(5, 3), 3);
  const { RequestBudgetFields } = loader({
    'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/reanimated': { default: { View: 'View' }, FadeIn: {}, FadeOut: {} },
    '@/hooks/useIdentityCheck': { useIdentityCheck: () => ({ isIdentityVerified: true, checkIdentity() {} }) },
  })('components/trip-request/RequestBudgetFields.tsx');
  const props = { vehicleOptions: [], budgetValue: 2000, budgetLabel: '2 000 FC', totalBudgetLabel: '6 000 FC', numberOfSeats: 3, requestSeatsLabel: '3 places', selectedVehicleType: 'car', setHasSpecifiedNumberOfSeats() {}, setNumberOfSeats: update => { props.numberOfSeats = update(props.numberOfSeats); } };
  const add = tree => nodes(tree).find(node => node.type === 'TouchableOpacity' && nodes(node).some(child => child.type === 'Icon' && child.props.name === 'add' && child.props.size === 18));
  const tree = RequestBudgetFields(props);
  assert.match(text(tree), /6 000 FC pour 3 places/);
  assert.equal(add(tree).props.disabled, false);
  add(tree).props.onPress();
  assert.equal(props.numberOfSeats, 4);
  props.selectedVehicleType = 'motorcycle_3_wheels';
  props.numberOfSeats = 3;
  assert.equal(add(RequestBudgetFields(props)).props.disabled, true);
});

test('verification suspends and restores the form without resetting its state; unmount cancels navigation', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(), calls = [];
  let active = true;
  const router = { push: href => calls.push(href) };
  const { usePassengerIdentityVerification } = loader({
    react: hooks.react, 'react-native': { Platform: { OS: 'ios' } },
    'expo-router': { useRouter: () => router },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
  })('hooks/usePassengerIdentityVerification.ts');
  const leave = () => calls.push('hide'), resume = () => calls.push('restore');
  const render = () => hooks.render(() => usePassengerIdentityVerification(leave, resume));
  const open = render(); open(); open();
  assert.deepEqual(calls, ['hide']);
  t.mock.timers.tick(350);
  assert.equal(calls[1].pathname, '/verification');
  active = false; render(); active = true; render();
  assert.equal(calls.at(-1), 'restore');
  const count = calls.length;
  render()(); hooks.unmount(); t.mock.timers.tick(400);
  assert.equal(calls.length, count + 1); // hide, but no late navigation
});

test('profile has a visible driver button and a separate passenger identity action', () => {
  const calls = [];
  const loadUi = loader({
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/reanimated': { default: { View: 'View' }, FadeInDown: { delay() {} } },
  });
  const { ProfileDashboard } = loadUi('components/profile/ProfileDashboard.tsx');
  const { ProfileIdentitySection } = loadUi('components/profile/ProfileIdentitySection.tsx');
  const tree = ProfileDashboard({
    driverStatusItems: [], driverTripsCount: 0, isDriver: false, isKycApproved: false, isKycPending: false,
    isKycRejected: false, isKycBusy: false, isPriorityCtaBusy: false, kycLoading: false, quickActionItems: [],
    handleOpenKycModal: () => calls.push('identity'),
    priorityCta: { label: 'Devenir conducteur', icon: 'car-outline', onPress: () => calls.push('driver') },
  });
  const driver = nodes(tree).find(node => node.type === 'TouchableOpacity' && text(node) === 'Devenir conducteur');
  assert.ok(driver);
  assert.equal(nodes(driver).find(node => node.type === 'Text').props.numberOfLines, undefined);
  driver.props.onPress();
  const identityProps = nodes(tree).find(node => node.type === ProfileIdentitySection).props;
  const identity = ProfileIdentitySection.type(identityProps);
  assert.match(text(identity), /Aucun véhicule requis/);
  assert.match(text(identity), /Vérifier mon identité/);
  nodes(identity).find(node => node.type === 'TouchableOpacity').props.onPress();
  assert.deepEqual(calls, ['driver', 'identity']);
  assert.doesNotMatch(text(tree) + text(identity), /KYC/);
});

test('passenger verification returns to the form only after closing its result dialog', async () => {
  for (const status of ['approved', 'pending', 'rejected']) {
    const routes = [], dialogs = [], starts = [];
    const Screen = loader({
      'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
      'react-native-safe-area-context': { SafeAreaView: 'View' },
      '@/utils/reanimated': { default: { View: 'View' }, FadeInDown: { springify() {} } },
      'expo-router': { useLocalSearchParams: () => ({ source: 'extra_seats' }), useRouter: () => ({ canGoBack: () => true, back: () => routes.push('back'), replace: route => routes.push(route) }) },
      '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: dialog => dialogs.push(dialog) }) },
      '@/hooks/useDiditKycFlow': { useDiditKycFlow: () => ({ isStartingDiditKyc: false, startDiditKyc: async options => { starts.push(options); return { status }; } }) },
    })('app/verification.tsx').default;
    const tree = Screen();
    assert.match(text(tree), /aucun véhicule/i);
    const start = nodes(tree).find(node => node.type === 'TouchableOpacity' && text(node).includes('Vérifier avec Didit'));
    await start.props.onPress();
    assert.deepEqual(starts, [{ showResultDialog: false }]);
    assert.deepEqual(routes, []);
    assert.equal(dialogs[0].actions[0].label, 'Revenir au formulaire');
    dialogs[0].actions[0].onPress();
    assert.deepEqual(routes, ['back']);
  }
});
