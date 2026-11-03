const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', TextInput: 'Input',
  StyleSheet: { create: value => value, hairlineWidth: 1 } };
const all = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(all)];
const text = node => typeof node === 'string' ? node : React.Children.toArray(node?.props?.children).map(text).join(' ');

test('the sole selected passenger is named, with an initial and no redundant selector', () => {
  const { RatingParticipantSelector: Person } = loader({ react: React, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' } })('features/rating/RatingParticipantSelector.tsx');
  const tree = Person({ isTripDriver: true, rateTargetType: 'passenger', selectedPassenger: 'one',
    passengers: [{ id: 'one', name: 'Personne Exemple', seats: 1 }], trip: {} });
  assert.match(text(tree), /Votre passager.*Personne Exemple/);
  assert.doesNotMatch(text(tree), /Choisissez|Attribuez/);
  assert.equal(all(tree).filter(node => node.type === 'Button').length, 0);
  assert.ok(all(tree).some(node => node.props?.children === 'P'));
});

test('several passengers have explicit accessible choices, including the selected state', () => {
  const calls = [];
  const { RatingParticipantSelector: Person } = loader({ react: React, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' } })('features/rating/RatingParticipantSelector.tsx');
  const props = { isTripDriver: true, rateTargetType: 'passenger', selectedPassenger: null,
    passengers: [{ id: 'one', name: 'Premier' }, { id: 'two', name: 'Deuxième' }], trip: {},
    setRateTargetType: value => calls.push(value), setSelectedPassenger: value => calls.push(value) };
  const buttons = all(Person(props)).filter(node => node.type === 'Button');
  assert.equal(buttons.length, 2); assert.ok(buttons.every(node => node.props.accessibilityRole === 'radio'));
  buttons[1].props.onPress(); assert.deepEqual(calls, ['passenger', 'two']);
  props.selectedPassenger = 'two'; props.disabled = true;
  const chosen = all(Person(props)).filter(node => node.type === 'Button');
  assert.equal(chosen[1].props.accessibilityState.checked, true);
  assert.ok(chosen.every(node => node.props.disabled));
});

test('a passenger sees the actual driver, not a generic target picker or another person’s average score', () => {
  const { RatingParticipantSelector: Person } = loader({ react: React, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' } })('features/rating/RatingParticipantSelector.tsx');
  const tree = Person({ isTripPassenger: true, rateTargetType: 'driver', passengers: [],
    trip: { driverId: 'driver', driverName: 'Conducteur Exemple', driverRating: 4.5 } });
  assert.match(text(tree), /Votre conducteur.*Conducteur Exemple/); assert.doesNotMatch(text(tree), /4.5|Choisissez/);
  assert.equal(all(tree).filter(node => node.type === 'Button').length, 0);
});

test('stars require an explicit choice, details are optional, and inputs lock during submission', () => {
  const hooks = hookHarness(), values = [];
  const { RatingReviewForm: Form } = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' } })('features/rating/RatingReviewForm.tsx');
  const props = { rating: 0, setRating: value => values.push(value), selectedTags: [], rateTags: [], comment: '',
    getRatingText: () => 'Très bien', disabled: false };
  const render = () => hooks.render(() => Form(props));
  let tree = render(); assert.match(text(tree), /Aucune note sélectionnée/);
  const stars = all(tree).filter(node => node.props?.accessibilityRole === 'radio');
  assert.equal(stars.length, 5); assert.ok(stars.every(node => !node.props.accessibilityState.checked));
  stars[3].props.onPress(); assert.deepEqual(values, [4]);
  props.rating = 4; tree = render(); assert.equal(all(tree).some(node => node.type === 'Input'), false);
  all(tree).find(node => node.props?.accessibilityState?.expanded === false).props.onPress();
  assert.equal(all(render()).filter(node => node.type === 'Input').length, 1);
  props.disabled = true; tree = render();
  assert.ok(all(tree).filter(node => node.type === 'Button').every(node => node.props.disabled));
  assert.equal(all(tree).find(node => node.type === 'Input').props.editable, false); hooks.unmount();
});

test('actual React effects settle after auto-selection and preserve drafts on a REST refresh', async () => {
  const previousWindow = globalThis.window, previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const doc = { nodeType: 9, addEventListener() {}, removeEventListener() {}, activeElement: null };
  doc.defaultView = { document: doc, HTMLIFrameElement: class {} };
  const container = { nodeType: 1, tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: doc,
    firstChild: null, addEventListener() {}, removeEventListener() {} };
  globalThis.window = doc.defaultView; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let model, renders = 0; const state = { people: ['one'], tripId: 'trip', loading: true };
  const { useRatingData } = loader({ react: React,
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    'expo-router': { useLocalSearchParams: () => ({ id: state.tripId }), useRouter: () => ({}) },
    '@/store/hooks': { useAppSelector: () => ({ id: 'driver' }) }, '@/store/selectors': { selectUser() {} },
    '@/store/api/tripApi': { useGetTripByIdQuery: () => ({ data: { id: state.tripId, driverId: 'driver' } }) },
    '@/store/api/bookingApi': { useGetTripBookingsQuery: () => ({ isLoading: state.loading, data: state.people.map(id => ({
      tripId: state.tripId, passengerId: id, passengerName: id, status: 'completed', numberOfSeats: 1 })) }), useGetMyBookingsForTripQuery: () => ({}) },
    '@/components/ui/DialogProvider': { useDialog: () => ({}) },
    '@/store/api/reviewApi': { useCreateReviewMutation: () => [() => {}, { isLoading: false }] },
  })('hooks/rating/useRatingData.ts');
  function Probe() { if (++renders > 60) throw Error('Unbounded updates'); model = useRatingData(); return null; }
  const root = createRoot(container), render = () => React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Probe))));
  try {
    await render(); assert.equal(model.selectedPassenger, null, 'wait for the passenger list');
    state.loading = false; await render(); assert.equal(model.selectedPassenger, 'one'); assert.equal(model.rating, 0);
    await React.act(async () => { model.setRating(4); model.setComment('Avis du premier'); });
    state.people = ['one', 'two']; await render(); assert.equal(model.rating, 4); assert.equal(model.comment, 'Avis du premier');
    await React.act(async () => model.setSelectedPassenger('two'));
    assert.equal(model.rating, 0); assert.equal(model.comment, ''); assert.equal(model.selectedPassenger, 'two');
    await render(); assert.equal(model.selectedPassenger, 'two'); assert.ok(renders < 30);
  } finally {
    await React.act(async () => root.unmount()); globalThis.window = previousWindow; globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
