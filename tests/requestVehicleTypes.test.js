const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const load = loader();
const selection = load('features/trip-request/vehicleSelection.ts');
const slice = load('store/slices/requestDraftsSlice.ts');
const car = 'car', moto = 'motorcycle_2_wheels', tricycle = 'motorcycle_3_wheels';

test('one vehicle uses the old production DTO; multiple choices are never silently lost or retried', () => {
  const { compatibleVehiclePayload, vehicleSelectionError } = load('features/trip-request/vehiclePayload.ts');
  const single = { vehicleType: car, vehicleTypes: [moto], expectedUpdatedAt: 'revision' };
  assert.deepEqual(compatibleVehiclePayload(single), { vehicleType: moto, expectedUpdatedAt: 'revision' });
  assert.deepEqual(single.vehicleTypes, [moto], 'do not mutate the saved draft');
  const multiple = { vehicleType: car, vehicleTypes: [car, moto] };
  assert.equal(compatibleVehiclePayload(multiple), multiple);
  const error = { status: 400, data: { message: ['property vehicleTypes should not exist'] } };
  assert.equal(vehicleSelectionError(error).data.code, 'MULTIPLE_VEHICLE_TYPES_UNAVAILABLE');
  for (const error of [{ status: 503 }, { status: 'TIMEOUT_ERROR' }, { status: 400, data: { message: 'other' } }])
    assert.equal(vehicleSelectionError(error), error);
});

test('selection is nonempty, reversible, deduplicated and has a stable legacy primary', () => {
  assert.deepEqual(selection.toggleRequestVehicleType([car], car), [car]);
  assert.deepEqual(selection.toggleRequestVehicleType([car], moto), [car, moto]);
  assert.deepEqual(selection.toggleRequestVehicleType([car, moto], car), [moto]);
  let state = slice.default(undefined, slice.initializeRequestDraft({ id: 'form', draft: slice.createRequestDraft(123, 30) }));
  const change = (field, value) => { state = slice.default(state, slice.changeRequestDraft({ id: 'form', change: { field, value } })); };
  change('selectedVehicleTypes', [moto, car, moto]);
  assert.deepEqual(state.byId.form.selectedVehicleTypes, [moto, car]);
  assert.equal(state.byId.form.selectedVehicleType, moto);
  change('selectedVehicleType', moto); // a recommendation effect must not erase the second choice
  assert.deepEqual(state.byId.form.selectedVehicleTypes, [moto, car]);
  change('selectedVehicleTypes', []);
  assert.deepEqual(state.byId.form.selectedVehicleTypes, [moto, car]);
});

test('legacy fallback, multi-choice labels and the smallest selected capacity agree', () => {
  assert.deepEqual(selection.acceptedRequestVehicleTypes({ vehicleType: moto }), [moto]);
  assert.deepEqual(selection.acceptedRequestVehicleTypes({ vehicleType: car, vehicleTypes: [car, moto] }), [car, moto]);
  assert.match(selection.requestVehicleLabel({ vehicleTypes: [car, moto] }), /Voiture.*Moto/);
  assert.equal(selection.requestVehicleSeatCapacity([car, moto]), 2);
  assert.equal(selection.requestVehicleSeatCapacity([car, tricycle]), 3);
  assert.equal(selection.requestVehicleSeatCapacity([car]), null);
});

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
test('route selector uses checkboxes, preserves the last choice and excludes insufficient capacities', () => {
  const { RequestRouteStep } = loader({
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', TextInput: 'Input', ScrollView: 'Scroll',
      ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/reanimated': { __esModule: true, default: { View: 'View' }, FadeIn: {} },
  })('components/trip-request/RequestRouteStep.tsx');
  const props = { selectedVehicleTypes: [car], numberOfSeats: 1, favoriteSuggestions: [],
    setSelectedVehicleTypes: updater => { props.selectedVehicleTypes = updater(props.selectedVehicleTypes); } };
  const buttons = () => nodes(RequestRouteStep(props)).filter(n => n.props.accessibilityRole === 'checkbox');
  const checkIcons = () => buttons().map(button => nodes(button).find(n =>
    n.type === 'Icon' && ['checkbox', 'square-outline'].includes(n.props.name)).props.name);
  assert.equal(buttons().length, 3);
  assert.ok(nodes(RequestRouteStep(props)).some(n => n.type === 'Text' && n.props.children === 'Cochez un ou plusieurs types.'));
  assert.deepEqual(checkIcons(), ['checkbox', 'square-outline', 'square-outline']);
  assert.match(buttons()[0].props.accessibilityHint, /au moins un type/);
  buttons()[1].props.onPress();
  assert.deepEqual(props.selectedVehicleTypes, [car, moto]);
  assert.deepEqual(buttons().map(b => b.props.accessibilityState.checked), [true, true, false]);
  assert.deepEqual(checkIcons(), ['checkbox', 'checkbox', 'square-outline']);
  buttons()[2].props.onPress();
  assert.deepEqual(props.selectedVehicleTypes, [car, moto, tricycle]);
  assert.deepEqual(checkIcons(), ['checkbox', 'checkbox', 'checkbox']);
  buttons()[2].props.onPress();
  buttons()[0].props.onPress(); buttons()[1].props.onPress();
  assert.deepEqual(props.selectedVehicleTypes, [moto]);
  props.selectedVehicleTypes = [car]; props.numberOfSeats = 3;
  assert.equal(buttons()[1].props.disabled, true);
  assert.match(buttons()[1].props.accessibilityHint, /Pas assez de places/);
  assert.equal(buttons()[2].props.disabled, false);
});

test('uncertain creation only reconciles a request with the exact accepted type set', async () => {
  const { recoverRequest } = loader({ '@/constants/network': { MUTATION_RECONCILIATION_DELAYS_MS: [0] } })('features/trip-request/recoverRequest.ts');
  const attempt = { startedAt: Date.now(), departure: 'a', arrival: 'b', departureDateMin: '2030-01-01T12:00:00Z',
    departureDateMax: '2030-01-01T13:00:00Z', seats: 1, price: 1000, vehicleType: car, vehicleTypes: [car, moto] };
  const request = { id: 'same', createdAt: new Date().toISOString(), departure: { name: 'A' }, arrival: { name: 'B' },
    departureDateMin: attempt.departureDateMin, departureDateMax: attempt.departureDateMax,
    numberOfSeats: 1, maxPricePerSeat: 1000, vehicleType: car };
  assert.equal(await recoverRequest(attempt, async () => [request], () => true), null);
  request.vehicleTypes = [moto, car];
  assert.equal(await recoverRequest(attempt, async () => [request], () => true), 'same');
});

test('editing restores every choice and adding a secondary type does not reset the manual budget', () => {
  const { hookHarness } = require('./helpers/hookHarness.cjs');
  const hooks = hookHarness();
  let types = [car], resets = 0;
  const noop = () => {};
  const props = {
    tripRequest: { id: 'request', status: 'pending', passengerId: 'owner', vehicleType: car, vehicleTypes: [car, moto],
      departure: { name: 'A', hasCoordinates: false }, arrival: { name: 'B', hasCoordinates: false },
      departureDateMin: '2030-01-01T12:00:00Z', departureDateMax: '2030-01-01T13:00:00Z', numberOfSeats: 1 },
    shouldOpenScheduleEditor: false, requestedVehicleType: car,
    setEditVehicleTypes: value => { types = value; }, resetEditBudget: () => { resets++; },
  };
  for (const name of ['ExpectedUpdatedAt', 'AddressInputMode', 'DepartureLocation', 'DepartureManualAddress', 'DepartureReference',
    'ArrivalLocation', 'ArrivalManualAddress', 'ArrivalReference', 'DepartureDateMin', 'DepartureDateMax', 'NumberOfSeats', 'Description']) props['setEdit' + name] = noop;
  props.setShowEditForm = noop;
  const { useRequestEditInitialization } = loader({ react: hooks.react,
    'react-native': { Keyboard: { dismiss: noop }, Platform: { OS: 'android' } },
  })('hooks/request-detail/useRequestEditInitialization.ts');
  const render = () => hooks.render(() => useRequestEditInitialization({ ...props, editVehicleTypes: types }));
  render().handleOpenEditForm();
  assert.deepEqual(types, [car, moto]); resets = 0;
  render().handleSelectEditVehicle({ vehicleType: tricycle, availableForRequestedSeats: true });
  assert.deepEqual(types, [car, moto, tricycle]); assert.equal(resets, 0);
  render().handleSelectEditVehicle({ vehicleType: car, availableForRequestedSeats: true });
  assert.deepEqual(types, [moto, tricycle]); assert.equal(resets, 1);
  render().handleSelectEditVehicle({ vehicleType: tricycle, availableForRequestedSeats: false });
  assert.deepEqual(types, [moto]); // An incompatible selected option can still be removed.
  render().handleSelectEditVehicle({ vehicleType: moto, availableForRequestedSeats: true });
  assert.deepEqual(types, [moto]); assert.equal(resets, 1);
  hooks.unmount();
});
