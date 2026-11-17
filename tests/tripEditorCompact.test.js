const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { tripEditorFixture } = require('./helpers/tripEditorFixture.cjs');
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => !tree ? '' : typeof tree === 'string' ? tree : Array.isArray(tree)
  ? tree.map(text).filter(Boolean).join(' ') : text(tree.props?.children);
function environment(os = 'android') {
  const hooks = hookHarness(), props = tripEditorFixture(), calls = [];
  const load = loader({ react: hooks.react, 'react-native': {
    Platform: { OS: os }, StyleSheet: { create: v => v }, Keyboard: { dismiss: () => calls.push('keyboard') },
    Text: 'Text', TextInput: 'Input', View: 'View', ScrollView: 'Scroll', TouchableOpacity: 'Button',
    KeyboardAvoidingView: 'Keyboard', ActivityIndicator: 'Spinner',
  }, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@react-native-community/datetimepicker': { __esModule: true, default: 'DatePicker' },
  '@/components/forms/FormLayout': { FormModal: 'Modal' } });
  const render = (path, name, input = props) => hooks.render(() => load(path)[name](input));
  const modal = () => render('features/trip-detail/TripEditModal.tsx', 'TripEditModal');
  return { hooks, props, calls, load, render, modal };
}
const footer = tree => nodes(tree).find(n => n.props?.testID === 'trip-edit-footer');
const action = tree => nodes(footer(tree)).find(n => n.type === 'Button');

for (const os of ['android', 'ios']) {
  test(`${os}: one complete scrollable form and a fixed save action, at either legacy validation step`, () => {
    const env = environment(os);
    for (const step of [1, 2]) {
      env.props.editStep = step;
      const tree = env.modal();
      assert.equal(tree.type, 'Modal');
      assert.equal(tree.props.transparent, os === 'android');
      assert.equal(tree.props.presentationStyle, os === 'ios' ? 'pageSheet' : 'overFullScreen');
      assert.equal(nodes(footer(tree)).filter(n => n.type === 'Button').length, 1);
      assert.equal(text(action(tree)), 'Enregistrer');
      const fields = nodes(tree).find(n => n.type.name === 'TripEditFields');
      const scroll = fields.type(fields.props);
      assert.equal(scroll.props.testID, 'trip-edit-content');
      assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
      assert.equal(nodes(scroll).some(n => n.type.name === 'TripEditorRouteFields'), true);
      assert.equal(nodes(scroll).some(n => n.type.name === 'TripEditorDetailsFields'), true);
      assert.equal(nodes(scroll).some(n => n.props?.testID === 'trip-edit-footer'), false);
    }
    env.props.editTripModalVisible = false;
    assert.equal(nodes(env.modal()).some(n => n.type.name === 'TripEditFields'), false);
    env.hooks.unmount();
  });
}

test('save locks immediately, blocks close and repeat taps, then enables the editor after validation returns', async () => {
  const env = environment(); let release, saved = 0, closed = 0;
  env.props.handleSaveTrip = () => { saved++; return new Promise(resolve => { release = resolve; }); };
  env.props.closeEditModal = () => { closed++; };
  const first = env.modal(), button = action(first), task = button.props.onPress();
  await button.props.onPress(); first.props.onRequestClose();
  assert.equal(saved, 1); assert.equal(closed, 0);
  const busy = env.modal();
  assert.equal(action(busy).props.disabled, true);
  assert.equal(nodes(busy).find(n => n.type.name === 'TripEditFields').props.disabled, true);
  release(); await task;
  const ready = env.modal(); assert.equal(action(ready).props.disabled, false);
  ready.props.onRequestClose(); assert.equal(closed, 1); env.hooks.unmount();
});

test('rejected or unmounted saves release the lock without a second submission', async () => {
  const env = environment(); env.props.handleSaveTrip = async () => { throw new Error('test-failure'); };
  await assert.rejects(action(env.modal()).props.onPress(), /test-failure/);
  assert.equal(action(env.modal()).props.disabled, false);
  let release;
  env.props.handleSaveTrip = () => new Promise(resolve => { release = resolve; });
  const task = action(env.modal()).props.onPress(); env.hooks.unmount(); release(); await task;
});

test('missing references scroll to the route and still delegate authoritative validation to the existing handler', async () => {
  const env = environment(); let saved = 0, scrolled;
  env.props.editDepartureSelection = { title: 'Gombe', address: 'Gombe' };
  env.props.handleSaveTrip = async () => { saved++; };
  const tree = env.modal();
  nodes(tree).find(n => n.type.name === 'TripEditFields').props.scrollRef.current = { scrollTo: value => { scrolled = value; } };
  await action(tree).props.onPress(); assert.deepEqual(scrolled, { y: 0, animated: true });
  assert.equal(saved, 1); env.hooks.unmount();
});

test('reprogramming retains its distinct explanation and publish action', () => {
  const env = environment(); env.props.trip.canReprogram = true;
  const tree = env.modal(); assert.match(text(tree), /sans les anciennes réservations/);
  assert.equal(text(action(tree)), 'Publier ce trajet'); env.hooks.unmount();
});

test('list editor delegates values, callbacks and map-picker suspension to the same sheet', () => {
  const env = environment();
  const input = { ...env.props, editingTrip: env.props.trip, editModalSuspended: false,
    vehiclesLoading: true, activeUserVehicles: env.props.activeEditVehicles };
  const render = () => env.render('features/trips/TripsEditModal.tsx', 'TripsEditModal', input);
  let tree = render();
  assert.equal(tree.type, env.load('features/trip-detail/TripEditModal.tsx').TripEditModal);
  assert.equal(tree.props.trip, input.editingTrip); assert.equal(tree.props.editTripModalVisible, true);
  assert.equal(tree.props.handleSaveTrip, input.handleSaveTrip); assert.equal(tree.props.editReferences, input.editReferences);
  assert.equal(tree.props.editVehiclesLoading, true); assert.equal(tree.props.activeEditVehicles, input.activeUserVehicles);
  input.editModalSuspended = true; assert.equal(render().props.editTripModalVisible, false);
  input.editModalSuspended = false; input.editingTrip = null; assert.equal(render().props.editTripModalVisible, false);
  env.hooks.unmount();
});

test('vehicle summary unfolds without another modal; no vehicle is chosen implicitly', () => {
  const env = environment(); const selected = [];
  const input = { vehicles: env.props.activeEditVehicles, loading: false, vehicleId: 'car-1', onSelect: id => selected.push(id) };
  const render = () => env.render('features/trips/TripEditorVehiclePicker.tsx', 'TripEditorVehiclePicker', input);
  let tree = render(); assert.equal(nodes(tree).some(n => n.props?.accessibilityRole === 'radio'), false);
  nodes(tree).find(n => n.type === 'Button').props.onPress(); tree = render();
  const options = nodes(tree).filter(n => n.props?.accessibilityRole === 'radio'); assert.equal(options.length, 2);
  options[1].props.onPress(); assert.deepEqual(selected, ['car-2']); input.vehicleId = 'car-2';
  assert.equal(nodes(render()).some(n => n.props?.accessibilityRole === 'radio'), false);
  input.vehicleId = null; tree = render(); assert.equal(nodes(tree).filter(n => n.props?.accessibilityRole === 'radio').length, 2);
  assert.deepEqual(selected, ['car-2']); input.disabled = true;
  nodes(render()).filter(n => n.props?.accessibilityRole === 'radio')[0].props.onPress(); assert.deepEqual(selected, ['car-2']);
  input.loading = true; assert.match(text(render()), /Chargement/);
  input.loading = false; input.vehicles = []; assert.match(text(render()), /Aucun véhicule actif/);
  env.hooks.unmount();
});

test('price, places and schedule remain editable, while negotiated request pricing remains read-only', () => {
  const env = environment(); const changes = [];
  env.props.setEditSeats = v => changes.push(['seats', v]); env.props.setEditPrice = v => changes.push(['price', v]);
  env.props.openDateOrTimePicker = mode => changes.push(['picker', mode]);
  const render = () => env.render('features/trips/TripEditorDetailsFields.tsx', 'TripEditorDetailsFields');
  let tree = render(); const inputs = nodes(tree).filter(n => n.type === 'Input');
  inputs[0].props.onChangeText('2'); inputs[1].props.onChangeText('3000');
  const buttons = nodes(tree).filter(n => n.type === 'Button'); buttons[0].props.onPress(); buttons[1].props.onPress();
  assert.deepEqual(changes, [['seats', '2'], ['price', '3000'], ['picker', 'date'], ['picker', 'time']]);
  env.props.trip.tripRequestId = 'request-test'; tree = render();
  assert.equal(nodes(tree).filter(n => n.type === 'Input').length, 1); assert.match(text(tree), /Prix convenu/);
  assert.equal(nodes(tree).some(n => n.props?.accessibilityLabel?.includes('non modifiable')), true);
  env.props.disabled = true; assert.equal(nodes(render()).find(n => n.type === 'Input').props.editable, false);
  env.hooks.unmount();
});

test('verification preference is folded by default and retains its controlled value', () => {
  const env = environment(); let changed;
  env.props.editRequiresPassengerKyc = true; env.props.setEditRequiresPassengerKyc = fn => { changed = fn(true); };
  const render = () => env.render('features/trips/TripEditorDetailsFields.tsx', 'TripEditorDetailsFields');
  let tree = render(); assert.match(text(tree), /Passagers vérifiés uniquement/);
  assert.equal(nodes(tree).some(n => n.props?.accessibilityRole === 'switch'), false);
  nodes(tree).find(n => n.props?.accessibilityState?.expanded === false).props.onPress(); tree = render();
  const toggle = nodes(tree).find(n => n.props?.accessibilityRole === 'switch');
  assert.equal(toggle.props.accessibilityState.checked, true); toggle.props.onPress(); assert.equal(changed, false);
  env.hooks.unmount();
});

test('inline iOS date picker retains the original callbacks and is inert during save', () => {
  const env = environment('ios'); let changes = 0; env.props.iosPickerMode = 'date';
  env.props.handleIosPickerChange = () => { changes++; };
  const render = () => env.render('features/trips/TripEditorDetailsFields.tsx', 'TripEditorDetailsFields');
  nodes(render()).find(n => n.type === 'DatePicker').props.onChange({}, new Date()); assert.equal(changes, 1);
  env.props.disabled = true; const tree = render();
  nodes(tree).find(n => n.type === 'DatePicker').props.onChange({}, new Date()); assert.equal(changes, 1);
  assert.equal(nodes(tree).some(n => n.props?.pointerEvents === 'none'), true); env.hooks.unmount();
});

test('a single route action reveals optional references without changing either address', () => {
  const env = environment();
  const render = () => env.render('features/trips/TripEditorRouteFields.tsx', 'TripEditorRouteFields');
  let tree = render();
  const references = () => nodes(tree).filter(n => n.type.name === 'TripEditReferenceFields');
  assert.equal(references().every(n => n.props.showOptional === false), true);
  nodes(tree).find(n => n.type === 'Button' && text(n) === 'Ajouter un repère').props.onPress();
  tree = render(); assert.equal(references().every(n => n.props.showOptional === true), true);
  assert.equal(references()[0].props.departureAddress, 'Avenue des Aviateurs');
  assert.equal(references()[1].props.arrivalAddress, 'Gare Centrale');
  assert.equal(nodes(tree).some(n => n.type === 'Button' && text(n) === 'Ajouter un repère'), false);
  env.hooks.unmount();
});
