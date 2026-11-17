const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const point = address => ({ title: address, address, latitude: -4.31, longitude: 15.31 });
const noop = () => {};
const references = (departureReference = '', arrivalReference = '') => ({
  departureReference, arrivalReference, reset: noop, swap: noop, setDepartureReference: noop, setArrivalReference: noop,
  clearIfAddressChanged: noop, clearIfLocationChanged: noop,
});
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const model = {
  getLocationText: (selection, manual) => (manual?.trim() || selection?.title || selection?.address || '').trim(),
  getLocationCoordinatesTuple: selection => selection ? [selection.longitude, selection.latitude] : undefined,
  getDefaultFutureDate: () => new Date('2030-01-01T12:00:00Z'),
};
const trip = { id: 'trip-test', status: 'upcoming', price: 2000, availableSeats: 2,
  departure: { name: 'Gombe', address: 'Gombe', lat: -4.31, lng: 15.31, reference: 'Pharmacie' },
  arrival: { name: 'Limete', address: 'Limete', lat: -4.32, lng: 15.32, reference: 'Marché' },
};

function fixture(kind, mode = 'map') {
  const hooks = hookHarness();
  const calls = { updates: [], reprogram: [], feedback: [], steps: [], geocodes: [], closed: 0 };
  const load = loader({
    react: hooks.react, 'react-native': { Keyboard: { dismiss: noop } },
    'expo-router': { useRouter: () => ({ replace: noop }) },
    '../../features/trip-detail/tripDetailModel': model, '../../features/trips/tripsModel': model,
    '@/store/hooks': { useAppDispatch: () => noop },
    '@/store/api/tripApi': { useReprogramTripMutation: () => [payload => ({ unwrap: async () => {
      calls.reprogram.push(payload); return { id: 'new-trip' };
    } })] },
    '@/utils/errorHelpers': { getApiErrorMessage: () => 'Erreur', isPassengerKycRequiredError: () => false },
  });
  const props = {
    trip, editingTrip: trip, isTripDriver: true, editDateTime: new Date('2030-01-01T12:00:00Z'),
    editVehicleId: 'vehicle', editSeats: '2', editPrice: '2500', editRouteMode: mode,
    editDepartureSelection: point('Gombe'), editArrivalSelection: point('Limete'),
    editDepartureManualAddress: 'Gombe', editArrivalManualAddress: 'Limete',
    editReferences: references(), setEditStep: step => calls.steps.push(step),
    showDialog: dialog => calls.feedback.push(dialog.message), showFeedback: (_type, message) => calls.feedback.push(message),
    setEditDepartureSelection: value => { props.editDepartureSelection = value; },
    setEditArrivalSelection: value => { props.editArrivalSelection = value; },
    setEditDepartureManualAddress: value => { props.editDepartureManualAddress = value; },
    setEditArrivalManualAddress: value => { props.editArrivalManualAddress = value; },
    setIosPickerMode: noop, closeEditModal: () => { calls.closed++; }, refetchTrip: noop,
    updateTripMutation: payload => ({ unwrap: async () => { calls.updates.push(payload); } }),
    resolveManualAddressSelection: async address => { calls.geocodes.push(address); return point(address); },
  };
  const save = kind === 'detail' ? load('hooks/trip-detail/useTripDetailEditSubmission.ts').useTripDetailEditSubmission
    : load('hooks/trips/useTripsManagementActions.ts').useTripsManagementActions;
  return { props, calls, hooks, load, render: () => hooks.render(() => save(props)) };
}

for (const kind of ['detail', 'list']) for (const mode of ['map', 'manual']) {
  test(`${kind}/${mode}: missing references block saving and target the route step; correction sends trimmed fields`, async () => {
    const f = fixture(kind, mode);
    await f.render().handleSaveTrip();
    assert.match(f.calls.feedback.at(-1), /au départ/);
    assert.equal(f.calls.updates.length, 0); assert.equal(f.calls.closed, 0);
    assert.deepEqual(f.calls.steps, [1]); assert.deepEqual(f.calls.geocodes, []);
    f.props.editReferences.departureReference = '   ';
    await f.render().handleSaveTrip();
    assert.equal(f.calls.updates.length, 0);
    f.props.editReferences.departureReference = '  Pharmacie  ';
    await f.render().handleSaveTrip();
    assert.match(f.calls.feedback.at(-1), /à l’arrivée/);
    assert.equal(f.calls.updates.length, 0);
    f.props.editReferences.arrivalReference = '  Marché  ';
    await f.render().handleSaveTrip();
    assert.equal(f.calls.updates.length, 1); assert.equal(f.calls.closed, 1);
    const { id, updates } = f.calls.updates[0];
    assert.equal(id, trip.id); assert.equal(updates.departureReference, 'Pharmacie');
    assert.equal(updates.arrivalReference, 'Marché');
    assert.equal(updates.pricePerSeat, 2500); assert.equal(updates.totalSeats, 2);
    f.hooks.unmount();
  });

  test(`${kind}/${mode}: precise addresses remain optional, including clearing an optional reference`, async () => {
    const f = fixture(kind, mode);
    f.props.editDepartureSelection = point('Avenue des Aviateurs, Gombe');
    f.props.editDepartureManualAddress = 'Avenue des Aviateurs, Gombe';
    f.props.editArrivalSelection = point('Gare Centrale, Gombe');
    f.props.editArrivalManualAddress = 'Gare Centrale, Gombe';
    await f.render().handleSaveTrip();
    assert.equal(f.calls.updates.length, 1);
    assert.equal(f.calls.updates[0].updates.departureReference, '');
    assert.equal(f.calls.updates[0].updates.arrivalReference, '');
    f.hooks.unmount();
  });

  test(`${kind}/${mode}: continuing cannot bypass a missing landmark`, () => {
    const f = fixture(kind, mode);
    const nav = kind === 'detail' ? f.load('hooks/trip-detail/useTripDetailEditRoute.ts').useTripDetailEditRoute
      : f.load('hooks/trips/useTripEditorNavigation.ts').useTripEditorNavigation;
    const render = () => f.hooks.render(() => nav(f.props));
    render().handleContinueEditTrip();
    assert.deepEqual(f.calls.steps, []); assert.match(f.calls.feedback.at(-1), /au départ/);
    f.props.editReferences = references('Pharmacie', 'Marché');
    render().handleContinueEditTrip();
    assert.deepEqual(f.calls.steps, [2]);
    let swaps = 0; f.props.editReferences.swap = () => swaps++;
    render().swapEditRoutePoints(); assert.equal(swaps, 1);
    assert.equal(f.props.editDepartureManualAddress, 'Limete');
    assert.equal(f.props.editArrivalManualAddress, 'Gombe');
    f.hooks.unmount();
  });
}

test('manual resolution revealing a commune blocks detail saving before mutation and keeps resolved location', async () => {
  const f = fixture('detail', 'manual');
  f.props.editDepartureManualAddress = 'Zone test';
  f.props.editArrivalManualAddress = 'Gare Centrale';
  f.props.resolveManualAddressSelection = async address => ({ ...point(address),
    addressComponents: [{ longName: address, types: ['locality'] }] });
  await f.render().handleSaveTrip();
  assert.deepEqual(f.calls.steps, [1]); assert.equal(f.calls.updates.length, 0);
  assert.match(f.calls.feedback.at(-1), /au départ/);
  assert.equal(f.props.editDepartureSelection.addressComponents[0].longName, 'Zone test');
  f.props.editReferences = references('Pharmacie', 'Entrée principale');
  await f.render().handleSaveTrip();
  assert.equal(f.calls.updates.length, 1);
  f.hooks.unmount();
});

test('reference validation also gates reprogramming and leaves negotiated request prices unchanged', async () => {
  const f = fixture('detail'); f.props.trip = { ...trip, canReprogram: true };
  await f.render().handleSaveTrip(); assert.equal(f.calls.reprogram.length, 0);
  f.props.editReferences = references('Pharmacie', 'Marché');
  await f.render().handleSaveTrip(); assert.equal(f.calls.reprogram.length, 1);
  assert.equal(f.calls.reprogram[0].updates.arrivalReference, 'Marché');
  f.props.trip = { ...trip, tripRequestId: 'request' };
  await f.render().handleSaveTrip();
  assert.equal(Object.hasOwn(f.calls.updates[0].updates, 'pricePerSeat'), false);
  f.hooks.unmount();
});

test('reference state hydrates, swaps with the route, and resets on another trip/closing', () => {
  const hooks = hookHarness();
  const { useTripEditReferences } = loader({ react: hooks.react })('hooks/trips/useTripEditReferences.ts');
  const render = () => hooks.render(useTripEditReferences);
  render().reset(trip); assert.equal(render().departureReference, 'Pharmacie');
  assert.equal(render().arrivalReference, 'Marché');
  render().swap(); assert.equal(render().departureReference, 'Marché');
  assert.equal(render().arrivalReference, 'Pharmacie');
  render().reset({ departure: {}, arrival: {} }); assert.equal(render().departureReference, '');
  render().setDepartureReference('Test'); render().reset(); assert.equal(render().departureReference, '');
  render().reset(trip);
  render().clearIfAddressChanged('departure', ' Gombe ', 'Gombe'); assert.equal(render().departureReference, 'Pharmacie');
  render().clearIfAddressChanged('departure', 'Matadi', 'Gombe'); assert.equal(render().departureReference, '');
  assert.equal(render().arrivalReference, 'Marché', 'only the changed endpoint is cleared');
  render().clearIfLocationChanged('arrival', point('Limete'), point('Limete'));
  assert.equal(render().arrivalReference, 'Marché');
  render().clearIfLocationChanged('arrival', { ...point('Limete'), latitude: -4.4 }, point('Limete'));
  assert.equal(render().arrivalReference, '');
  hooks.unmount();
});

for (const os of ['ios', 'android']) {
  test(`${os}: both edit forms expose references with matching requirements and accessible 200-character inputs`, () => {
    let hooks = hookHarness();
    const react = Object.fromEntries(Object.keys(hooks.react).map(key => [key, (...args) => hooks.react[key](...args)]));
    const load = loader({ react, 'react-native': { Platform: { OS: os }, StyleSheet: { create: v => v },
      Text: 'Text', TextInput: 'Input', View: 'View', ScrollView: 'Scroll', TouchableOpacity: 'Button' },
      '@expo/vector-icons': { Ionicons: 'Icon' }, '@react-native-community/datetimepicker': {},
      '../screen-styles/app/trip/detail/index': { styles: {} }, '../screen-styles/app/tabs/trips/index': { styles: {} },
    });
    const Fields = load('features/trips/TripEditReferenceFields.tsx').TripEditReferenceFields;
    for (const [path, name] of [['features/trips/TripEditorRouteFields.tsx', 'TripEditorRouteFields'],
      ['features/trip-detail/TripEditFields.tsx', 'TripEditFields']]) {
      const Component = load(path)[name];
      for (const mode of ['map', 'manual']) {
        const cleared = [], edited = [];
        const props = { editStep: 1, editRouteMode: mode, editReferences: references(),
          editDepartureSelection: point('Gombe'), editArrivalSelection: point('Avenue des Écoles'),
          editDepartureManualAddress: 'Gombe', editArrivalManualAddress: 'Avenue des Écoles',
          setEditDepartureManualAddress: value => edited.push(value), setEditArrivalManualAddress: value => edited.push(value) };
        props.editReferences.clearIfAddressChanged = (...args) => cleared.push(args);
        hooks = hookHarness();
        let tree = hooks.render(() => Component(props));
        if (name === 'TripEditFields') {
          const route = nodes(tree).find(n => n.type.name === 'TripEditorRouteFields');
          tree = hooks.render(() => route.type(route.props));
        }
        const embedded = nodes(tree).filter(n => n.type === Fields);
        assert.equal(embedded.length, 2, path);
        const fields = embedded.flatMap(item => nodes(Fields(item.props)).filter(n => typeof n.type === 'function'));
        assert.equal(fields.length, 2); assert.equal(fields[0].props.required, true); assert.equal(fields[1].props.required, false);
        for (const field of fields) {
          hooks = hookHarness();
          let rendered = hooks.render(() => field.type(field.props));
          if (!field.props.required) {
            assert.equal(rendered, null, 'empty optional reference is initially folded');
            rendered = hooks.render(() => field.type({ ...field.props, showOptional: true }));
          }
          const input = nodes(rendered.type(rendered.props)).find(n => n.type === 'Input');
          assert.equal(input.props.maxLength, 200);
          assert.match(input.props.accessibilityLabel, /Repère/);
          hooks.unmount();
        }
        if (mode === 'manual') {
          const addressInputs = nodes(tree).filter(n => n.type === 'Input');
          addressInputs[0].props.onChangeText('Matadi'); addressInputs[1].props.onChangeText('Limete');
          assert.deepEqual(edited, ['Matadi', 'Limete']);
          assert.deepEqual(cleared, [['departure', 'Matadi', 'Gombe'], ['arrival', 'Limete', 'Avenue des Écoles']]);
        }
      }
    }
  });
}

test('new manually typed places do not inherit the previous commune metadata', () => {
  const { getTripEditReferenceError } = loader()('features/trips/tripEditReferences.ts');
  assert.equal(getTripEditReferenceError(references(), 'Pharmacie Test', 'Gare Centrale',
    { ...point('Gombe'), placeTypes: ['locality'] }), null);
});

for (const kind of ['detail', 'list']) {
  test(`${kind}: opening and closing the actual editor initializes and resets saved references`, () => {
    const hooks = hookHarness();
    const load = loader({ react: hooks.react, 'react-native': { Keyboard: { dismiss: noop } },
      '../../features/trip-detail/tripDetailModel': model, '../../features/trips/tripsModel': model });
    const useReferences = load('hooks/trips/useTripEditReferences.ts').useTripEditReferences;
    const useEditor = kind === 'detail' ? load('hooks/trip-detail/useTripDetailEditorLifecycle.ts').useTripDetailEditorLifecycle
      : load('hooks/trips/useTripEditorNavigation.ts').useTripEditorNavigation;
    const props = { trip, isTripDriver: true, shouldOpenEditFromParams: false,
      openEditModalRef: { current: noop }, handledOpenEditParamKeyRef: { current: null }, getDefaultFutureDate: model.getDefaultFutureDate };
    for (const name of ['EditingTrip', 'EditSeats', 'EditPrice', 'EditDateTime', 'EditRequiresPassengerKyc',
      'EditDepartureSelection', 'EditArrivalSelection', 'EditDepartureManualAddress', 'EditArrivalManualAddress',
      'EditRouteMode', 'EditRoutePickerTarget', 'EditVehicleId', 'EditStep', 'EditTripModalVisible', 'IosPickerMode', 'EditModalSuspended']) {
      props[`set${name}`] = noop;
    }
    const render = () => hooks.render(() => {
      const refs = useReferences();
      return { refs, editor: useEditor({ ...props, editReferences: refs }) };
    });
    render().editor.openEditModal(trip);
    assert.equal(render().refs.departureReference, 'Pharmacie');
    assert.equal(render().refs.arrivalReference, 'Marché');
    render().editor.closeEditModal();
    assert.equal(render().refs.departureReference, ''); assert.equal(render().refs.arrivalReference, '');
    hooks.unmount();
  });
}
