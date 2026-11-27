const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const words = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(words).join(' ') : words(tree?.props?.children ?? '');
function fixture() {
  const state = { active: true, calls: [], changes: [], retries: 0, query: { currentData: {
    acceptedPaymentModes: ['cash', 'electronic', 'points'], availablePaymentModes: ['cash', 'points'], cashUnavailableReason: null,
  } } };
  const Choices = loader({ react: React, 'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
    './tripDetailModel': { TRIP_PAYMENT_MODE_OPTIONS: ['cash', 'electronic', 'points'].map(id => ({ id, icon: 'cash-outline' })) },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/store/api/driverFinanceApi': { useTripPaymentOptionsQuery: (args, options) => {
      state.calls.push({ args, options }); return { ...state.query, refetch: () => { state.retries++; } };
    } },
  })('features/trip-detail/BookingPaymentChoices.tsx').BookingPaymentChoices;
  state.props = { trip: { id: 'trip', acceptedPaymentModes: ['electronic'] }, seats: '2', total: 6000,
    value: 'electronic', busy: false, visible: true, onChange: mode => state.changes.push(mode) };
  state.render = () => Choices(state.props);
  return state;
}
test('payment choices are visible without expanding or scrolling; endpoint availability is authoritative', () => {
  const f = fixture(), tree = f.render(), buttons = nodes(tree).filter(n => n.props.accessibilityRole === 'radio');
  assert.equal(buttons.length, 3); assert.match(words(tree), /Mode de paiement/);
  assert.match(words(tree), /Choisissez une option disponible/);
  assert.deepEqual(buttons.map(n => n.props.disabled), [false, true, false]);
  assert.equal(buttons.every(n => !n.props.accessibilityState.checked), true);
  buttons[2].props.onPress(); assert.deepEqual(f.changes, ['points']);
  f.props.value = 'points'; assert.equal(nodes(f.render()).find(n => n.props.accessibilityLabel === 'Jetons').props.accessibilityState.checked, true);
  assert.deepEqual(f.calls[0].args, { tripId: 'trip', numberOfSeats: 2 });
});
test('seat changes recheck availability; refresh and submission disable selection', () => {
  const f = fixture(); f.props.seats = '3'; f.query.isFetching = true;
  let tree = f.render(); assert.equal(f.calls[0].args.numberOfSeats, 3);
  assert.equal(nodes(tree).filter(n => n.props.accessibilityRole === 'radio').every(n => n.props.disabled), true);
  assert.ok(nodes(tree).some(n => n.type === 'Spinner'));
  f.query.isFetching = false; f.props.busy = true; tree = f.render();
  assert.equal(nodes(tree).filter(n => n.props.accessibilityRole === 'radio').every(n => n.props.disabled), true);
});
test('no modes and API errors explain the problem and expose retry instead of demanding an impossible choice', () => {
  const f = fixture(); f.query.currentData.availablePaymentModes = [];
  let tree = f.render(); assert.match(words(tree), /Aucun mode disponible/);
  assert.doesNotMatch(words(tree), /Choisissez une option/);
  nodes(tree).find(n => n.props.accessibilityLabel === 'Réessayer les modes de paiement').props.onPress(); assert.equal(f.retries, 1);
  f.query.isError = true; tree = f.render(); assert.match(words(tree), /Vérification indisponible/);
  assert.equal(nodes(tree).filter(n => n.props.accessibilityRole === 'radio').every(n => n.props.disabled), true);
});
test('free trips, hidden modal and inactive screen never request payment options', () => {
  const f = fixture(); f.props.total = 0; assert.equal(f.render(), null); assert.equal(f.calls.at(-1).options.skip, true);
  f.props.total = 3000; f.props.visible = false; f.render(); assert.equal(f.calls.at(-1).options.skip, true);
  f.props.visible = true; f.active = false; f.render(); assert.equal(f.calls.at(-1).options.skip, true);
});
