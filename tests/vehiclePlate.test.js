const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { isValidVehiclePlate, normalizeVehiclePlate, VEHICLE_PLATE_FORMAT_MESSAGE } = loader()('utils/vehiclePlate.ts');
const noop = () => {};
const vehicle = { id: 'vehicle', type: 'car', brand: 'Toyota', model: 'Corolla', color: 'Bleu', licensePlate: '1234AB56' };

test('plate format requires exactly four ASCII digits, two letters and two final digits', () => {
  for (const plate of ['1234AB56', '0000AA00', '9999ZZ99', '1234ab56', ' 1234-AB-56 ', '1234 AB 56']) {
    assert.equal(isValidVehiclePlate(plate), true, plate);
    assert.match(normalizeVehiclePlate(plate), /^[0-9]{4}[A-Z]{2}[0-9]{2}$/);
  }
  for (const plate of ['', null, undefined, 'ABC123', '123AB456', '12345A67', '1234A567', '1234ABC5',
    '1234AB5', '1234AB567', 'A1234AB56', '1234AB56X', '1234ÀB56', '１２３４AB56', '1234ß56', '1234💡56', '1234.AB56']) {
    assert.equal(isValidVehiclePlate(plate), false, String(plate));
  }
});

test('normalization never truncates a long plate or silently repairs invalid letters', () => {
  assert.equal(normalizeVehiclePlate('1234ab567'), '1234AB567');
  assert.equal(normalizeVehiclePlate('1234ß56'), '1234ß56');
  assert.equal(normalizeVehiclePlate('1234!AB56'), '1234!AB56');
  assert.equal(normalizeVehiclePlate('0001az02'), '0001AZ02');
});

function profileFixture() {
  const hooks = hookHarness(), calls = [], dialogs = [];
  const mutation = kind => () => [payload => ({ unwrap: async () => { calls.push({ kind, payload }); return vehicle; } }), { isLoading: false }];
  const { useProfileVehicles } = loader({
    react: hooks.react, 'expo-router': { useRouter: () => ({}) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: dialog => dialogs.push(dialog) }) },
    '@/features/profile/profileModel': { vehicleMatchesFormData: () => false },
    '@/utils/errorHelpers': { getApiErrorMessage: (_error, message) => message },
    '@/store/api/vehicleApi': { useCreateVehicleMutation: mutation('create'), useUpdateVehicleMutation: mutation('update'), useDeleteVehicleMutation: mutation('delete') },
  })('hooks/profile/useProfileVehicles.ts');
  const props = { vehicleList: [], refetchVehicles: async () => ({ data: [] }), refetchProfile: async () => ({}) };
  return { hooks, calls, dialogs, render: () => hooks.render(() => useProfileVehicles(props)) };
}

for (const editing of [false, true]) {
  test(`profile ${editing ? 'update' : 'create'} blocks invalid plates before RTK Query then sends the canonical format`, async () => {
    const f = profileFixture(); let form = f.render();
    if (editing) form.openEditVehicleModal({ ...vehicle, licensePlate: 'ABC123' });
    else {
      form.openCreateVehicleModal(); form.setVehicleType('car');
      form.handleVehicleBrandChange('Toyota'); form.handleVehicleModelChange('Corolla'); form.handleVehicleColorChange('Bleu');
    }
    for (const plate of ['ABC123', '1234A56', '1234AB567']) {
      f.render().handleVehiclePlateChange(plate); await f.render().handleSaveVehicle();
      assert.equal(f.calls.length, 0);
      assert.equal(f.render().vehicleFormError, VEHICLE_PLATE_FORMAT_MESSAGE);
      assert.equal(f.render().vehicleModalVisible, true);
    }
    f.render().handleVehiclePlateChange('0001 az 02');
    assert.equal(f.render().vehiclePlate, '0001AZ02');
    await f.render().handleSaveVehicle();
    assert.equal(f.calls.length, 1);
    const call = f.calls[0]; assert.equal(call.kind, editing ? 'update' : 'create');
    assert.equal((editing ? call.payload.data : call.payload).licensePlate, '0001AZ02');
    if (editing) assert.equal(call.payload.id, vehicle.id);
    f.hooks.unmount();
  });
}

test('vehicle creation during publication enforces the same rule without changing trip selection', async () => {
  const calls = [], errors = [], selections = [];
  const { usePublishVehicleCreation } = loader({ 'react-native': { Keyboard: { dismiss: noop } } })('hooks/publish/usePublishVehicleCreation.ts');
  const props = { vehicleType: 'car', vehicleBrand: 'Toyota', vehicleModel: 'Corolla', vehicleColor: 'Bleu',
    vehicleLicensePlate: 'ABC123', setVehicleFormError: error => errors.push(error),
    createVehicle: payload => ({ unwrap: async () => { calls.push(payload); return vehicle; } }),
    setIsFinalizingVehicleCreation: noop, setCreatedVehicle: noop, setSelectedVehicleId: id => selections.push(id),
    setVehicleCreationMessage: noop, setShowVehicleForm: noop, resetVehicleForm: noop,
    refetchProfile: async () => ({}), refetchVehicles: async () => ({}) };
  await usePublishVehicleCreation(props).handleCreateVehicle();
  assert.equal(calls.length, 0); assert.equal(errors.at(-1), VEHICLE_PLATE_FORMAT_MESSAGE);
  props.vehicleLicensePlate = '1234 ab 56';
  await usePublishVehicleCreation(props).handleCreateVehicle();
  assert.equal(calls[0].licensePlate, '1234AB56'); assert.deepEqual(selections, ['vehicle']);
});

function signupFixture() {
  const calls = [], dialogs = [], steps = [];
  const mutation = method => payload => ({ unwrap: async () => { calls.push({ method, payload }); return { accessToken: 'test', refreshToken: 'test' }; } });
  const load = loader({
    'react-native': { Platform: { OS: 'ios' } }, 'expo-image-picker': {},
    '../../features/auth/authModel': { ensureAuthNotifeeLoaded: noop, notifeeInstance: null, getAuthErrorMessage: (_error, message) => message },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/store/slices/authSlice': { saveTokensAndUpdateState: noop },
    '@/utils/referralAttribution': { getPendingReferralAttribution: async () => null, consumePendingReferralAttribution: async () => {} },
  });
  const props = { firstName: 'Eugene', lastName: 'Bosuku', role: 'driver', vehicleType: 'car',
    vehicleBrand: 'Toyota', vehicleModel: 'Corolla', vehicleColor: 'Bleu', vehiclePlate: '1234ab56',
    setStep: step => steps.push(step), showDialog: dialog => dialogs.push(dialog),
    setFirstName: noop, setLastName: noop, handleFinalRegister: () => calls.push('register-from-profile'),
    phone: '+243891234567', pin: '1234', googleIdToken: null, isGooglePhoneVerified: false,
    register: mutation('phone'), googleMobile: mutation('google'), appleMobile: mutation('apple'),
    dispatch: () => ({ unwrap: async () => {} }), startDiditKyc: async () => {}, router: { replace: noop },
  };
  for (const key of ['GoogleIdToken', 'GoogleProfileName', 'GoogleFirstName', 'GoogleLastName', 'GoogleEmail',
    'GooglePhone', 'GoogleOtp', 'GoogleFlow', 'IsGooglePhoneVerified', 'SocialProvider', 'AppleNonce']) props[`set${key}`] = noop;
  return { calls, dialogs, steps, props, load };
}

test('signup profile rejects a malformed driver plate, while passengers still require no vehicle', () => {
  const f = signupFixture(); const { useSignupProfileActions } = f.load('hooks/auth/useSignupProfileActions.ts');
  f.props.vehiclePlate = 'ABC123';
  useSignupProfileActions(f.props).validateProfileAndContinue();
  assert.deepEqual(f.steps, []); assert.equal(f.dialogs.at(-1).message, VEHICLE_PLATE_FORMAT_MESSAGE);
  f.props.vehiclePlate = '1234ab56'; useSignupProfileActions(f.props).validateProfileAndContinue();
  assert.deepEqual(f.steps, ['kyc']);
  f.props.role = 'passenger'; f.props.vehiclePlate = ''; f.props.vehicleType = null;
  useSignupProfileActions(f.props).validateProfileAndContinue();
  assert.deepEqual(f.calls, ['register-from-profile']);
});

for (const method of ['phone', 'google', 'apple']) {
  test(`${method} final registration revalidates and normalizes the plate before sending`, async () => {
    const f = signupFixture(); const { useRegistrationActions } = f.load('hooks/auth/useRegistrationActions.ts');
    if (method !== 'phone') Object.assign(f.props, { googleIdToken: 'test', isGooglePhoneVerified: true, socialProvider: method });
    f.props.vehiclePlate = 'ABC123';
    await useRegistrationActions(f.props).handleFinalRegister();
    assert.equal(f.calls.length, 0); assert.equal(f.dialogs.at(-1).message, VEHICLE_PLATE_FORMAT_MESSAGE);
    f.props.vehiclePlate = '0001 az 02';
    await useRegistrationActions(f.props).handleFinalRegister();
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].method, method);
    const payload = f.calls[0].payload;
    assert.equal(method === 'phone' ? payload.get('vehicle[licensePlate]') : payload.vehicle.licensePlate, '0001AZ02');
    f.props.role = 'passenger'; f.props.vehiclePlate = ''; f.props.vehicleType = null;
    await useRegistrationActions(f.props).handleFinalRegister();
    const passengerPayload = f.calls[1].payload;
    assert.equal(method === 'phone' ? passengerPayload.has('vehicle[licensePlate]') : Boolean(passengerPayload.vehicle), false);
  });
}

const elements = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(elements) : [node, ...elements(node.props?.children)];
for (const auth of [false, true]) {
  test(`${auth ? 'signup' : 'shared create/update'} field normalizes typing and disables validation for malformed plates`, () => {
    const hooks = hookHarness(), changes = [];
    const load = loader({ react: { ...React, ...hooks.react }, '@expo/vector-icons': { Ionicons: 'Icon' },
      'react-native': { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', ScrollView: 'Scroll',
        KeyboardAvoidingView: 'KeyboardView', ActivityIndicator: 'Spinner', Platform: { OS: 'android' },
        StyleSheet: { create: value => value }, Keyboard: { dismiss: noop, addListener: () => ({ remove: noop }) } },
      '@/components/forms/FormLayout': { FormModal: 'Modal' },
      'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    });
    const Component = auth ? load('components/auth/VehicleModal.tsx').VehicleModal : load('components/VehicleFormModal.tsx').VehicleFormModal;
    const props = { visible: true, vehicleType: 'car', onClose: noop, onSubmit: noop,
      onPlateChange: value => changes.push(value), onLicensePlateChange: value => changes.push(value) };
    for (const plate of ['', 'ABC123', '1234AB567', '1234AB56']) {
      props.vehiclePlate = plate; props.licensePlate = plate;
      const tree = hooks.render(() => Component(props));
      const input = elements(tree).find(node => node.props?.accessibilityLabel === "Plaque d'immatriculation");
      assert.ok(input.props.placeholder.includes('1234AB56')); assert.equal(input.props.autoCorrect, false);
      const button = elements(tree).filter(node => node.type === 'Button').at(-1);
      assert.equal(button.props.disabled, plate !== '1234AB56');
      input.props.onChangeText('1234 ab 56'); assert.equal(changes.at(-1), '1234AB56');
    }
    hooks.unmount();
  });
}
