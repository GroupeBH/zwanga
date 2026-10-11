const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const native = { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button',
  ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } };
const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/hooks/useIdentityCheck': { useIdentityCheck: () => ({ isIdentityVerified: true, checkIdentity() {} }) },
  '@/components/PassengerSeatNotice': { PassengerSeatNotice: 'SeatNotice' },
  '@/utils/reanimated': { __esModule: true, default: { View: 'AnimatedView' }, FadeIn: {}, FadeOut: {} },
});
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join('');
  return React.isValidElement(tree) ? text(tree.props.children) : '';
}

test('publication keeps all five steps in one compact, accessible progress indicator', () => {
  const { PublishStepIndicator } = load('features/publish/PublishStepIndicator.tsx');
  const steps = ['route', 'datetime', 'vehicle', 'pricing', 'confirm'];
  for (const [index, id] of steps.entries()) {
    const tree = PublishStepIndicator({ isStepActive: step => step === id, isStepCompleted: step => steps.indexOf(step) < index });
    assert.equal(tree.props.accessibilityRole, 'progressbar');
    assert.equal(tree.props.accessibilityValue.now, index + 1);
    assert.equal(tree.props.accessibilityValue.max, 5);
    assert.match(text(tree), new RegExp(`${index + 1} sur 5`));
    assert.equal(nodes(tree).filter(node => node.type === 'Text').length, 1);
    assert.equal(nodes(tree).filter(node => node.type === 'Button').length, 0, 'steps cannot bypass validation');
  }
});

test('compact order controls preserve price, seat limits, payment selection, total and notes', () => {
  const calls = [];
  const { RequestBudgetFields } = load('components/trip-request/RequestBudgetFields.tsx');
  const props = { vehicleOptions: [], budgetValue: 1000, budgetLabel: '1 000 FC', budgetHintLabel: 'Prix recommandé par place',
    totalBudgetLabel: '2 000 FC', requestSeatsLabel: '2 places', numberOfSeats: 2, selectedVehicleType: 'motorcycle_2_wheels',
    updateBudget: value => calls.push(['price', value]), setNumberOfSeats: update => calls.push(['seats', update(2)]),
    setHasSpecifiedNumberOfSeats() {}, setRequestPaymentMode: value => calls.push(['payment', value]),
    setShowAdvanced: update => calls.push(['note', update(false)]), requestPaymentMode: 'cash' };
  const tree = RequestBudgetFields(props);
  const all = nodes(tree);
  const press = label => all.find(node => node.props.accessibilityLabel === label).props.onPress();
  press('Diminuer le prix par place'); press('Augmenter le prix par place');
  press('Diminuer le nombre de places');
  const cash = all.find(node => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'Espèces (cash)');
  assert.equal(cash.props.accessibilityState.checked, true); cash.props.onPress();
  all.find(node => node.type === 'Button' && text(node) === 'Ajouter une note').props.onPress();
  assert.deepEqual(calls, [['price', 500], ['price', 1500], ['seats', 1], ['payment', 'cash'], ['note', true]]);
  const total = all.find(node => node.type === 'Text' && text(node).startsWith('Total estimé ·'));
  assert.match(text(total), /2 000 FC pour 2 places/);
  assert.equal(total.props.numberOfLines, undefined, 'the total can wrap instead of clipping large fonts');
  const atMinimum = nodes(RequestBudgetFields({ ...props, numberOfSeats: 1, budgetValue: 500 }));
  for (const label of ['Diminuer le nombre de places', 'Diminuer le prix par place']) {
    assert.equal(atMinimum.find(node => node.props.accessibilityLabel === label).props.disabled, true);
  }
});
