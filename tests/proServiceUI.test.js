const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function nodes(tree) {
  if (tree == null || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function nativeUI(extra = {}) {
  return {
    View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'Button',
    StyleSheet: { create: styles => styles }, ...extra,
  };
}
const offering = { code: 'documents', name: 'Documents', availability: 'open', documentOptions: [{ code: 'permis', label: 'Permis' }] };

test('catalogue opens the matching service and future services have no submit action', () => {
  const routes = [];
  const { OpenService, UpcomingServices } = loader({
    'react-native': nativeUI(),
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { router: { push: route => routes.push(route) } },
    './ServiceLayout': { ServiceButton: 'ServiceButton', s: {} },
  })('features/pro-services/ServiceCatalogue.tsx');
  const button = nodes(OpenService({ item: offering })).find(node => node.type === 'ServiceButton');
  button.props.onPress();
  assert.equal(routes[0].params.service, 'documents');
  const future = nodes(UpcomingServices({ items: [{ ...offering, code: 'fleet', availability: 'coming_soon' }] }));
  assert.equal(future.filter(node => node.props?.onPress).length, 0);
  assert.ok(future.includes('À venir'));
});

test('document choices expose accessible multi-selection and toggle only the chosen document', () => {
  const harness = hookHarness();
  const changes = [];
  const { ServiceNeedStep } = loader({
    react: harness.react, 'react-native': nativeUI(),
    '@expo/vector-icons': { Ionicons: 'Icon' }, './ServiceLayout': { s: {} },
  })('features/pro-services/ServiceFormFields.tsx');
  const controller = { form: { documents: ['permis'], description: '' }, errors: {}, change: (...args) => changes.push(args) };
  const tree = nodes(harness.render(() => ServiceNeedStep({ controller, offering })));
  const checkbox = tree.find(node => node.props?.accessibilityRole === 'checkbox');
  assert.equal(checkbox.props.accessibilityState.checked, true);
  assert.equal(checkbox.props.accessibilityLabel, 'Permis');
  checkbox.props.onPress();
  assert.deepEqual(changes, [['documents', []]]);
});

test('review keeps details visible and disables edit and consent after an uncertain send', () => {
  const { ServiceFormReview } = loader({
    'react-native': nativeUI(), '@expo/vector-icons': { Ionicons: 'Icon' },
    './ServiceLayout': { s: {} },
  })('features/pro-services/ServiceFormReview.tsx');
  const tree = nodes(ServiceFormReview({ offering, controller: {
    form: { fullName: 'Compte test', phone: '0000000000', documents: ['permis'], plate: '', description: '' },
    errors: {}, consent: true, locked: true, goTo() {}, toggleConsent() {},
  } }));
  assert.ok(tree.includes('Permis'));
  assert.ok(tree.includes('Compte test'));
  const controls = tree.filter(node => node.props?.onPress);
  assert.equal(controls.length, 3);
  assert.ok(controls.every(node => node.props.disabled === true));
});

test('form back subscription is removed when inactive and does not dismiss another screen keyboard', () => {
  const harness = hookHarness();
  let listeners = 0;
  let dismissals = 0;
  const c = { step: 1, errors: {}, locked: false, goTo() {}, form: {} };
  const { ServiceRequestForm } = loader({
    react: harness.react,
    'react-native': nativeUI({
      BackHandler: { addEventListener: () => { listeners++; return { remove() { listeners--; } }; } },
      Keyboard: { dismiss: () => { dismissals++; } },
      ScrollView: 'ScrollView',
    }),
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-router': { router: {} },
    './useProServiceForm': { useProServiceForm: () => c },
    './ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'ServiceButton', s: {} },
    './ServiceFormFields': { ServiceNeedStep: 'Need', ServiceContactStep: 'Contact' },
    './ServiceFormReview': { ServiceFormReview: 'Review' },
  })('features/pro-services/ServiceRequestForm.tsx');
  const render = active => harness.render(() => ServiceRequestForm({ offering, initial: {}, active }));
  render(true);
  assert.equal(listeners, 1);
  assert.equal(dismissals, 1);
  render(false);
  assert.equal(listeners, 0);
  c.step = 2;
  render(false);
  assert.equal(dismissals, 1);
  render(true);
  assert.equal(listeners, 1);
  harness.unmount();
  assert.equal(listeners, 0);
});
