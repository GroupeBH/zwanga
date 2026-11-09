const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { homeRequestFixture, homeRequestBoundaryMocks } = require('./helpers/homeRequestFixture.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes)
  : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const words = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree)
  ? tree.map(words).join('') : React.isValidElement(tree) ? words(tree.props.children) : '';

function fixture(t) {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const calls = [], form = homeRequestFixture(), dimensions = { height: 844, width: 390, fontScale: 1 };
  const flow = { locked: false, pickup: { status: 'ready', source: 'gps' },
    pickerTarget: null, submit: () => calls.push('submit'), handleBack: () => calls.push('back'),
    openPicker: value => calls.push(value), closePicker: () => calls.push('close'), onSelect() {} };
  const load = loader({ react: { ...React, ...hooks.react }, ...homeRequestBoundaryMocks,
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', TextInput: 'Input',
      ScrollView: 'Scroll', KeyboardAvoidingView: 'KeyboardView', ActivityIndicator: 'Spinner',
      Platform: { OS: 'android' }, StyleSheet: { create: x => x }, useWindowDimensions: () => dimensions },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-maps': { __esModule: true, default: 'Map', Marker: 'Marker', Polyline: 'Polyline' },
    '@/assets/images/map-markers/trip-detail-marker-departure.png': 1,
    '@/assets/images/map-markers/trip-detail-marker-arrival.png': 2,
    '@/components/forms/FormLayout': { FormScreen: 'Form' },
    '@/hooks/trip-request/useHomeRequestFlow': { useHomeRequestFlow: () => flow },
    '@/utils/reanimated': { __esModule: true, default: { View: 'Animated' }, FadeIn: {}, FadeOut: {} },
  });
  form.handlePrimaryAction = () => calls.push('submit');
  const { HomeRequestScreen } = load('components/trip-request/HomeRequestScreen.tsx');
  return { hooks, load, form, flow, dimensions, calls,
    render: () => hooks.render(() => HomeRequestScreen({ form, navigation: { scrollRef: { current: null }, handleBack() {} } })) };
}

test('confirmed locations show the quote immediately even if the legacy step is still route', t => {
  const f = fixture(t); f.form.requestFormStep = 'route';
  const tree = f.render(), all = nodes(tree);
  assert.match(words(tree), /DépartAvenue des Aviateurs/);
  assert.doesNotMatch(words(tree), /Voir le prix|Point de départ choisi|Choisir mon départ/);
  assert.ok(all.some(n => n.type.name === 'HomeRequestChoices'));
  assert.ok(all.some(n => n.type.name === 'RequestBudgetFields'));
  for (const [label, target] of [['Départ :', 'departure'], ['Arrivée :', 'arrival']]) {
    all.find(n => n.props.accessibilityLabel?.startsWith(label)).props.onPress();
    assert.equal(f.calls.at(-1), target);
  }
  const footer = all.find(n => n.props.testID === 'home-request-footer');
  assert.equal(nodes(footer).filter(n => n.type === 'Button').length, 1);
  assert.match(words(footer), /Départ maintenant.*1 place.*3 500 FC/);
  nodes(footer).find(n => n.type === 'Button').props.onPress(); assert.equal(f.calls.at(-1), 'submit');
  assert.ok(all.some(n => n.type === 'Scroll'), 'quote and options remain scrollable at small heights');
  assert.equal(nodes(all.find(n => n.type === 'Scroll')).some(n => n.props.testID === 'home-request-footer'), false);
  f.dimensions.height = 568; f.dimensions.fontScale = 1.5;
  assert.equal(nodes(f.render()).find(n => n.type?.type?.name === 'HomeRequestMap').props.height, 120);
});

for (const target of ['arrival', 'departure']) test('inline ' + target + ' selection replaces the entire form, with no background map or intermediate page', t => {
  const f = fixture(t); f.flow.pickerTarget = target;
  f.form.activePicker = target;
  f.form[target + 'Location'] = null;
  const all = nodes(f.render()), picker = all.find(n => n.type === 'InlinePicker');
  assert.ok(picker);
  assert.equal(picker.props.title, target === 'departure' ? 'Où vous chercher ?' : 'Où allez-vous ?');
  assert.equal(picker.props.confirmLabel, target === 'departure' ? 'Me chercher ici' : 'Aller ici');
  assert.equal(picker.props.focusSearchOnOpen, target === 'arrival');
  assert.equal(picker.props.initialLocation, null);
  assert.equal(picker.props.autoLocateOnOpen, false);
  assert.equal(picker.props.mapEnabled, true);
  assert.match(picker.props.contextLabel, target === 'departure' ? /^Arrivée :/ : /^Départ :/);
  assert.equal(all.some(n => n.type === 'Picker' || n.type === 'Scroll' || n.type?.type?.name === 'HomeRequestMap'), false);
  assert.equal(all.some(n => n.props.testID === 'home-request-footer'), false);
  picker.props.onClose(); assert.deepEqual(f.calls, ['close']);
  f.form.isScreenActive = false;
  assert.equal(nodes(f.render()).some(n => n.type === 'InlinePicker'), false, 'no active map when hidden');
});

test('slow GPS leaves useful quote options visible and disables ordering until a real pickup is available', t => {
  const f = fixture(t);
  Object.assign(f.form, { departureLocation: null, departureAddress: '', requestFormStep: 'route' });
  f.flow.pickup.status = 'loading';
  let all = nodes(f.render()), footer = all.find(n => n.props.testID === 'home-request-footer');
  assert.match(words(f.render()), /Recherche de votre position/);
  assert.equal(nodes(footer).find(n => n.type === 'Button').props.disabled, true);
  assert.ok(all.some(n => n.type.name === 'HomeRequestChoices'));
  assert.equal(all.some(n => n.type.name === 'RequestBudgetFields'), false, 'no price for a missing pickup');
  f.flow.pickup.status = 'unavailable'; f.flow.pickerTarget = 'departure';
  all = nodes(f.render());
  assert.ok(all.some(n => n.type === 'InlinePicker'));
  assert.doesNotMatch(words(f.render()), /Position introuvable|Réessayer ma position|Choisir mon départ|Voir le prix/);
  assert.equal(all.some(n => n.props.testID === 'home-request-footer'), false);
});

test('a missing time selection, blocked target or invalid budget cannot submit a quote', t => {
  const f = fixture(t); f.form.hasChosenDepartureTime = false;
  let footer = nodes(f.render()).find(n => n.props.testID === 'home-request-footer');
  assert.match(words(footer), /Choisir l’heure de départ/);
  f.form.canSubmitRequestDetails = false;
  footer = nodes(f.render()).find(n => n.props.testID === 'home-request-footer');
  assert.equal(nodes(footer).find(n => n.type === 'Button').props.disabled, true);
});

test('sending and recovery lock edits; the existing success/reconciliation modal remains the only recovery action', t => {
  const f = fixture(t); f.flow.locked = true; f.form.isCreating = true;
  let all = nodes(f.render());
  assert.equal(all.find(n => n.type === 'Scroll').props.pointerEvents, 'none');
  assert.equal(all.find(n => n.props.testID === 'home-request-footer').props.children[2].props.disabled, true);
  f.form.isRequestSuccessVisible = true; all = nodes(f.render());
  assert.equal(all.some(n => n.props.testID === 'home-request-footer'), false);
});

test('read-only route preview labels the destination instead of asking to select on a disabled map', t => {
  const f = fixture(t), { HomeRequestMap } = f.load('components/trip-request/HomeRequestMap.tsx');
  const tree = HomeRequestMap.type({ ...f.form, departureLocation: null, enabled: true, height: 150 });
  assert.match(words(tree), /Votre destination/);
  assert.doesNotMatch(words(tree), /Choisissez|4,2 km/);
});

test('compact choices preserve multi-select, last-type protection, seat capacity and explicit planned-time selection', t => {
  const f = fixture(t); const { HomeRequestChoices } = f.load('components/trip-request/HomeRequestChoices.tsx');
  f.form.setSelectedVehicleTypes = update => { f.form.selectedVehicleTypes = update(f.form.selectedVehicleTypes); };
  f.form.applyPreset = preset => { f.form.timePreset = preset; };
  f.form.setHasChosenDepartureTime = value => { f.form.hasChosenDepartureTime = value; };
  const render = () => HomeRequestChoices({ form: f.form });
  const press = label => nodes(render()).find(n => n.props.accessibilityLabel === label).props.onPress();
  press('Voiture'); assert.deepEqual(f.form.selectedVehicleTypes, ['car']);
  press('Moto à 2 roues'); assert.deepEqual(f.form.selectedVehicleTypes, ['car', 'motorcycle_2_wheels']);
  press('Moto à 2 roues'); f.form.numberOfSeats = 4;
  assert.equal(nodes(render()).find(n => n.props.accessibilityLabel === 'Moto à 2 roues').props.disabled, true);
  press('Choisir un autre jour ou une autre heure');
  assert.equal(f.form.timePreset, 'custom'); assert.equal(f.form.hasChosenDepartureTime, false);
});

test('payment, seat count, references, notes and driver targeting remain available behind explicit summaries', t => {
  const f = fixture(t); const { HomeRequestExtras } = f.load('components/trip-request/HomeRequestExtras.tsx');
  const render = () => f.hooks.render(() => HomeRequestExtras({ form: f.form }));
  let all = nodes(render()); assert.equal(all.some(n => n.type === 'Input'), false);
  assert.match(words(render()), /Cash · 1 place/);
  all.find(n => n.props.accessibilityLabel?.startsWith('Modifier le paiement')).props.onPress();
  all = nodes(render()); assert.ok(all.some(n => n.props.section === 'options'));
  all.find(n => n.type === 'Button' && words(n).includes('Ajouter une précision')).props.onPress();
  all = nodes(render()); assert.deepEqual(all.filter(n => n.type === 'Input').map(n => n.props.accessibilityLabel),
    ['Repère au départ', 'Repère à l’arrivée', 'Note pour le conducteur']);
  assert.ok(all.some(n => n.type === 'DriverPicker'));
  f.form.targetDriver = { name: 'Conducteur test' }; assert.match(words(render()), /Pour Conducteur test/);
});

test('compact pricing retains a readable total, capacity/payment logic and an offline budget action', t => {
  const f = fixture(t); const { RequestBudgetFields } = f.load('components/trip-request/RequestBudgetFields.tsx');
  f.form.isVehicleOptionsError = true; f.form.budgetValue = 0; f.form.budgetLabel = 'Prix à calculer';
  f.form.updateBudget = value => f.calls.push(value);
  const tree = RequestBudgetFields({ ...f.form, compact: true, section: 'price' });
  assert.match(words(tree), /Fixez votre budget/);
  const all = nodes(tree); assert.equal(all.some(n => n.props.accessibilityRole === 'radio'), false);
  all.find(n => n.props.accessibilityLabel === 'Augmenter le prix par place').props.onPress();
  assert.deepEqual(f.calls, [500]);
  const styles = f.load('features/trip-request/homeRequestStyles.ts').homeRequestStyles;
  assert.ok(require('./helpers/contrast.cjs').contrast(styles.submit.backgroundColor, styles.submitText.color) >= 4.5);
  assert.ok(styles.submit.minHeight >= 44); assert.equal(styles.submitText.flexShrink, 1);
});
