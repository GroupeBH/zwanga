const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = {
  Platform: { OS: 'android' }, StyleSheet: { create: value => value },
  Modal: 'Modal', View: 'View', Text: 'Text', TextInput: 'TextInput', Image: 'Image',
  TouchableOpacity: 'TouchableOpacity', Pressable: 'Pressable', ScrollView: 'ScrollView',
  KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator',
};
const motion = { delay() { return this; }, duration() { return this; } };
const errors = {
  getApiErrorMessage: (_error, fallback) => fallback,
  isDailyPublicationLimitError: () => false, isDriverRequiredError: () => false,
  isPassengerKycRequiredError: () => false, isExtraSeatsIdentityError: () => false,
};
const mocks = {
  'react-native': native, '@expo/vector-icons': { Ionicons: 'Ionicons' },
  '@/components/forms/FormLayout': { FormModal: 'FormModal' },
  '@/utils/reanimated': { default: { View: 'AnimatedView' }, FadeInDown: motion },
  '@/utils/errorHelpers': errors,
};
const location = { name: 'Gombe', lat: -4.3, lng: 15.3, address: 'Gombe', hasCoordinates: true };
const request = {
  id: 'request', passengerId: 'passenger', status: 'pending',
  departureDateMin: '2099-01-01T10:00:00Z', departureDateMax: '2099-01-01T11:00:00Z',
  departure: location, arrival: { ...location, lat: -4.32 }, numberOfSeats: 2, maxPricePerSeat: 2000,
};
const vehicle = id => ({ id, brand: 'Toyota', model: 'Corolla', color: 'Bleu', type: 'car', licensePlate: id, isActive: true });
const noop = () => {};
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return React.isValidElement(tree) ? [tree, ...elements(tree.props.children)] : [];
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join('');
  return React.isValidElement(tree) ? text(tree.props.children) : '';
}

function driverActionsHook() {
  const hooks = hookHarness();
  const { useRequestDriverActions } = loader({
    ...mocks, react: { ...React, ...hooks.react },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/hooks': { useAppDispatch: () => noop },
    '@/store/api/tripApi': { tripApi: { util: { upsertQueryEntries: value => value } } },
  })('hooks/request-detail/useRequestDriverActions.ts');
  return params => hooks.render(() => useRequestDriverActions(params));
}

test('request acceptance still uses the selected vehicle and confirmed price is never replaced in its payload', async () => {
  const calls = [], dialogs = [], routes = [];
  const useRequestDriverActions = driverActionsHook();
  const params = {
    tripRequest: request, id: request.id, showDialog: value => dialogs.push(value),
    router: { push: value => routes.push(value) }, refetch: noop,
    directAcceptDepartureDate: new Date(request.departureDateMin), canAcceptRequest: true,
    setShowDirectAcceptModal: noop, compatibleActiveVehicles: [vehicle('first'), vehicle('second')],
    requestedVehicleType: 'car', directAcceptVehicle: vehicle('second'),
    directAcceptRequiresPassengerKyc: true, directAcceptDepartureLocation: null,
    directAcceptArrivalLocation: null, directAcceptDepartureReference: '', directAcceptArrivalReference: '',
    acceptTripRequest: input => { calls.push(input); return { unwrap: async () => ({ trip: { id: 'created' } }) }; },
    startTrip: () => { throw new Error('Must not start without the driver choosing to start'); },
    setAreDirectOptionsExpanded: noop,
  };
  await useRequestDriverActions(params).handleDirectAcceptTripRequest(false);
  assert.deepEqual(calls, [{ tripRequestId: 'request', payload: {
    vehicleId: 'second', departureDate: '2099-01-01T10:00:00.000Z', requiresPassengerKyc: true,
  } }]);
  dialogs.at(-1).actions[0].onPress();
  assert.deepEqual(routes, ['/trip/manage/created']);
  calls.length = 0;
  await useRequestDriverActions({ ...params, directAcceptVehicle: null }).handleDirectAcceptTripRequest(false);
  assert.equal(calls.length, 0);
  await useRequestDriverActions({ ...params, tripRequest: { ...request, departureDateMax: '2000-01-01' } }).handleDirectAcceptTripRequest(false);
  assert.equal(calls.length, 0);
});

test('a start failure after acceptance keeps access to the created trip without accepting a second time', async () => {
  const dialogs = [], routes = [];
  let accepts = 0;
  const useRequestDriverActions = driverActionsHook();
  await useRequestDriverActions({
    tripRequest: request, id: request.id, showDialog: value => dialogs.push(value),
    router: { push: value => routes.push(value) }, refetch: noop,
    directAcceptDepartureDate: new Date(request.departureDateMin), canAcceptRequest: true,
    setShowDirectAcceptModal: noop, compatibleActiveVehicles: [vehicle('first')],
    requestedVehicleType: 'car', directAcceptVehicle: vehicle('first'),
    directAcceptRequiresPassengerKyc: false, directAcceptDepartureLocation: null,
    directAcceptArrivalLocation: null, directAcceptDepartureReference: '', directAcceptArrivalReference: '',
    acceptTripRequest: () => { accepts++; return { unwrap: async () => ({ trip: { id: 'created' } }) }; },
    startTrip: () => ({ unwrap: async () => { throw new Error('offline'); } }),
  }).handleDirectAcceptTripRequest(true);
  assert.equal(accepts, 1);
  assert.equal(dialogs.at(-1).variant, 'warning');
  dialogs.at(-1).actions[0].onPress();
  assert.deepEqual(routes, ['/trip/manage/created']);
});

test('edit submission sends the displayed per-seat price and refuses a pending calculation', async () => {
  const calls = [], dialogs = [];
  const { useRequestPassengerActions } = loader(mocks)('hooks/request-detail/useRequestPassengerActions.ts');
  const params = {
    isUpdating: false, isEditVehicleOptionsLoading: false, showDialog: value => dialogs.push(value),
    id: request.id, editDepartureAddress: 'Gombe', editArrivalAddress: 'Limete',
    editDepartureDateMin: new Date(request.departureDateMin), editDepartureDateMax: new Date(request.departureDateMax),
    parsedEditNumberOfSeats: 4, editSeatCapacity: 5, isEditVehicleSelectionValid: true,
    isIdentityVerified: true, parsedEditBudget: 2250, isEditBudgetValid: true,
    updateTripRequest: input => { calls.push(input); return { unwrap: async () => {} }; },
    editDepartureReference: '  station ', editArrivalReference: '', editAddressInputMode: 'manual',
    editVehicleType: 'car', editDescription: '', setShowEditForm: noop, refetch: noop,
  };
  await useRequestPassengerActions(params).handleUpdateRequest();
  assert.equal(calls[0].payload.maxPricePerSeat, 2250);
  assert.equal(calls[0].payload.numberOfSeats, 4);
  assert.equal(calls[0].payload.departureReference, 'station');
  assert.equal(calls[0].payload.departureCoordinates, undefined);
  await useRequestPassengerActions({ ...params, isEditVehicleOptionsLoading: true }).handleUpdateRequest();
  assert.equal(calls.length, 1);
  assert.equal(dialogs.at(-1).title, 'Calcul du prix en cours');
});

test('form state retains edits across renders and releases both location-picker timers on unmount', () => {
  const hooks = hookHarness(), load = loader({ ...mocks, react: { ...React, ...hooks.react } });
  const { useRequestDetailFormState } = load('hooks/request-detail/useRequestDetailFormState.ts');
  let form = hooks.render(useRequestDetailFormState);
  const setter = form.setEditNumberOfSeats;
  form.setEditNumberOfSeats('4'); form.setShowEditForm(true); form.setDirectAcceptVehicleId('second');
  form = hooks.render(useRequestDetailFormState);
  assert.equal(form.editNumberOfSeats, '4'); assert.equal(form.directAcceptVehicleId, 'second');
  assert.equal(form.setEditNumberOfSeats, setter);
  const timers = [setTimeout(noop, 10000), setTimeout(noop, 10000)];
  form.editPickerTransitionTimerRef.current = timers[0]; form.directPickerTransitionTimerRef.current = timers[1];
  const cleared = [], original = global.clearTimeout;
  global.clearTimeout = timer => { cleared.push(timer); original(timer); };
  try { hooks.unmount(); } finally { global.clearTimeout = original; timers.forEach(original); }
  assert.deepEqual(cleared, timers);
});

test('acceptance modal keeps the vehicle actions, protected footer and disabled submission state', () => {
  const choices = [];
  const { RequestAcceptModal } = loader(mocks)('features/request-detail/RequestAcceptModal.tsx');
  const params = {
    showDirectAcceptModal: true, closeDirectAcceptModal: noop, directAcceptDepartureDate: new Date(request.departureDateMin),
    requestedVehicleType: 'car', compatibleActiveVehicles: [vehicle('first'), vehicle('second')],
    directAcceptVehicleId: 'first', directAcceptVehicle: vehicle('first'), setDirectAcceptVehicleId: id => choices.push(id),
    directAcceptRequiresPassengerKyc: false, directAcceptDepartureReference: '', directAcceptArrivalReference: '',
    areDirectOptionsExpanded: false, canAcceptRequest: true, isAcceptingTripRequest: false, isStartingTrip: false,
    handleDirectAcceptTripRequest: noop,
  };
  const tree = RequestAcceptModal(params);
  assert.equal(tree.type, 'FormModal');
  const buttons = elements(tree).filter(node => typeof node.props.onPress === 'function');
  const second = buttons.find(node => text(node).includes('second'));
  assert.ok(second); second.props.onPress(); assert.deepEqual(choices, ['second']);
  const busy = elements(RequestAcceptModal({ ...params, isAcceptingTripRequest: true }));
  const submits = busy.filter(node => node.type === 'TouchableOpacity' && node.props.disabled);
  assert.ok(submits.length > 0);
});

test('native location disclosure still requires consent and Android back declines it', () => {
  const answers = [];
  const { NavigationLocationDisclosure } = loader(mocks)('features/driver-navigation/NavigationLocationDisclosure.tsx');
  const tree = NavigationLocationDisclosure({ backgroundDisclosureVisible: true, resolveBackgroundDisclosure: value => answers.push(value) });
  assert.equal(tree.props.visible, true);
  tree.props.onRequestClose();
  const actions = elements(tree).filter(node => node.type === 'TouchableOpacity');
  actions.forEach(node => node.props.onPress());
  assert.deepEqual(answers, [false, false, true]);
});
