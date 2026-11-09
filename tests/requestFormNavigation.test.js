const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes)
  : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const words = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(words).join('')
  : React.isValidElement(tree) ? words(tree.props.children) : '';

function fixture(t) {
  const hooks = hookHarness('request-navigation'), calls = [], listeners = new Set();
  const slice = loader()('store/slices/requestDraftsSlice.ts');
  const store = configureStore({ reducer: { requestDrafts: slice.default } });
  let focused = true, latestDraft;
  const form = {
    requestFormStep: 'route', isCreating: false, isRequestSuccessVisible: false,
    createdRequestId: null, submissionRecoveryMessage: null, insets: {},
    setRequestFormStep: step => { form.requestFormStep = step; },
    router: { back: () => calls.push('exit') },
    handlePrimaryAction: () => { form.requestFormStep = 'details'; },
    primaryLabel: 'Continuer',
  };
  const mocks = {
    react: { ...React, ...hooks.react },
    'expo-router': { useFocusEffect: callback => hooks.react.useEffect(
      () => focused ? callback() : undefined, [focused, callback]) },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll',
      KeyboardAvoidingView: 'KeyboardView', ActivityIndicator: 'Spinner', Platform: { OS: 'android' },
      StyleSheet: { create: value => value },
      Keyboard: { dismiss: () => calls.push('keyboard') },
      BackHandler: { addEventListener: (event, handler) => {
        assert.equal(event, 'hardwareBackPress'); listeners.add(handler);
        return { remove: () => listeners.delete(handler) };
      } },
    },
    'react-redux': { useStore: () => store },
    '@/store/hooks': { useAppDispatch: () => store.dispatch, useAppSelector: select => select(store.getState()) },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/reanimated': { default: { View: 'Animated' }, FadeIn: {} },
    '@/components/LocationPickerModal': { default: 'LocationPicker' },
    '@/components/forms/FormLayout': { FormScreen: 'Form' },
    '@/components/trip-request/HomeRequestScreen': { HomeRequestScreen: 'HomeRequestScreen' },
    '@/hooks/trip-request/useRequestTripController': { useRequestTripController: () => {
      latestDraft = load('hooks/trip-request/useRequestDraft.ts').useRequestDraft();
      return { ...latestDraft, ...form };
    } },
  };
  for (const name of ['RequestBudgetFields', 'RequestDatePickerModal', 'RequestDriverPicker', 'RequestPrimaryButton',
    'RequestRoutePreview', 'RequestRouteStep', 'RequestScheduleFields', 'RequestSuccessModal']) {
    mocks['@/components/trip-request/' + name] = { [name]: name };
  }
  const load = loader(mocks), Screen = load('app/request/index.tsx').default;
  const render = () => hooks.render(Screen);
  t.after(() => hooks.unmount());
  const button = (tree, label) => nodes(tree).find(n => n.type === 'Button' && n.props.accessibilityLabel === label);
  return { render, form, calls, listeners, store, hooks, button, draft: () => latestDraft,
    focus: value => { focused = value; }, back: () => [...listeners].at(-1)?.() };
}
const previousLabel = 'Étape précédente : départ et arrivée';
const headerLabel = 'Revenir à la première étape : départ et arrivée';

test('Home delegates back to its inline workspace without installing a second Android listener', t => {
  const f = fixture(t); Object.assign(f.form, { isHomeEntry: true, requestFormStep: 'details' });
  const home = nodes(f.render()).find(n => n.type === 'HomeRequestScreen');
  assert.ok(home);
  assert.equal(f.listeners.size, 0);
  home.props.navigation.returnToRoute(); assert.equal(f.form.requestFormStep, 'details');
  home.props.navigation.handleBack();
  assert.deepEqual(f.calls, ['exit']); assert.equal(f.form.requestFormStep, 'details');
});

test('previous step preserves the real Redux draft, resets scroll and leaves submission untouched', t => {
  const f = fixture(t); let tree = f.render();
  assert.equal(f.button(tree, previousLabel), undefined);
  const draft = f.draft();
  draft.setDepartureManualAddress('Départ test');
  draft.setArrivalManualAddress('Arrivée test');
  draft.setDepartureReference('Entrée test');
  draft.setArrivalReference('Portail test');
  draft.setDepartureDateMin(new Date('2030-11-04T15:00:00Z'));
  draft.setHasChosenDepartureTime(true);
  draft.setNumberOfSeats(2);
  draft.setHasSpecifiedNumberOfSeats(true);
  draft.setMaxPricePerSeat('3500');
  draft.setHasEditedBudget(true);
  draft.setSelectedVehicleType('car');
  draft.setRequestPaymentMode('points');
  draft.setDescription('Note test');
  draft.setTargetDriver({ id: 'synthetic-driver', vehicleType: 'car' });
  const saved = JSON.parse(JSON.stringify(f.store.getState().requestDrafts.byId));
  const scrolls = [];
  nodes(tree).find(n => n.type === 'Scroll').props.ref.current = { scrollTo: value => scrolls.push(value) };
  nodes(tree).find(n => n.type === 'RequestPrimaryButton').props.handlePrimaryAction();
  tree = f.render();
  assert.match(words(tree), /2 sur 2/);
  f.button(tree, previousLabel).props.onPress();
  tree = f.render();
  assert.equal(f.form.requestFormStep, 'route');
  assert.match(words(tree), /1 sur 2/);
  assert.equal(f.calls.includes('exit'), false);
  assert.ok(f.calls.includes('keyboard'));
  assert.deepEqual(scrolls, [{ y: 0, animated: false }, { y: 0, animated: false }]);
  nodes(tree).find(n => n.type === 'RequestPrimaryButton').props.handlePrimaryAction();
  f.render();
  assert.equal(f.form.requestFormStep, 'details');
  assert.deepEqual(f.store.getState().requestDrafts.byId, saved);
});

test('header and route summary go back one step; only first-step header exits', t => {
  const f = fixture(t); f.form.requestFormStep = 'details';
  let tree = f.render();
  f.button(tree, headerLabel).props.onPress();
  assert.equal(f.form.requestFormStep, 'route'); assert.equal(f.calls.includes('exit'), false);
  f.form.requestFormStep = 'details'; tree = f.render();
  const preview = nodes(tree).find(n => n.type === 'RequestRoutePreview');
  assert.equal(preview.props.editDisabled, false);
  preview.props.onEditRoute(); assert.equal(f.form.requestFormStep, 'route');
  tree = f.render(); f.button(tree, 'Retour').props.onPress();
  assert.equal(f.calls.filter(value => value === 'exit').length, 1);
});

test('Android back uses the current step and removes its listener on blur/unmount', t => {
  const f = fixture(t); f.form.requestFormStep = 'details'; f.render();
  assert.equal(f.listeners.size, 1); assert.equal(f.back(), true);
  assert.equal(f.form.requestFormStep, 'route'); f.render();
  assert.equal(f.back(), false); assert.equal(f.calls.includes('exit'), false);
  f.focus(false); f.render(); assert.equal(f.listeners.size, 0);
  f.focus(true); f.render(); assert.equal(f.listeners.size, 1);
  f.hooks.unmount(); assert.equal(f.listeners.size, 0);
});

for (const lock of [{ isCreating: true }, { createdRequestId: 'sent-request' },
  { submissionRecoveryMessage: 'Vérification' }, { isRequestSuccessVisible: true }]) {
  test('sending, sent or uncertain requests cannot be edited through back: ' + Object.keys(lock)[0], t => {
    const f = fixture(t); Object.assign(f.form, { requestFormStep: 'details' }, lock);
    const tree = f.render(), header = f.button(tree, headerLabel);
    assert.equal(header.props.disabled, true);
    assert.equal(header.props.accessibilityState.disabled, true);
    header.props.onPress();
    const previous = f.button(tree, previousLabel);
    if (previous) { assert.equal(previous.props.disabled, true); previous.props.onPress(); }
    nodes(tree).find(n => n.type === 'RequestRoutePreview')?.props.onEditRoute();
    assert.equal(f.back(), true);
    assert.equal(f.form.requestFormStep, 'details');
    assert.deepEqual(f.calls, []);
  });
}
