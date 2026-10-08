const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { isValidVehiclePlate, normalizeVehiclePlate, VEHICLE_PLATE_FORMAT_MESSAGE } = loader()('utils/vehiclePlate.ts');
const noop = () => {};
const vehicle = { id: 'vehicle', type: 'car', brand: 'Toyota', model: 'Corolla', color: 'Bleu', licensePlate: '1234AB56' };

test('plates accept motorcycle/car formats and variable lengths; only an empty normalized value is rejected', () => {
  for (const plate of ['1234AB56', '0000AA00', '9999ZZ99', '1234ab56', ' 1234-AB-56 ', '1234 AB 56',
    'MOTO-001', 'TRIKE-001', 'ABC123', '123AB456', '1234AB567', 'A1234AB56', '1234.AB56', '1', 'AB1234567890']) {
    assert.equal(isValidVehiclePlate(plate), true, plate);
  }
  for (const plate of ['', null, undefined, '   ', '---', ' - - ']) {
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
  test(`profile ${editing ? 'update' : 'create'} keeps a required plate but accepts motorcycle formats`, async () => {
    const f = profileFixture(); let form = f.render();
    if (editing) form.openEditVehicleModal({ ...vehicle, licensePlate: 'ABC123' });
    else {
      form.openCreateVehicleModal(); form.setVehicleType('car');
      form.handleVehicleBrandChange('Toyota'); form.handleVehicleModelChange('Corolla'); form.handleVehicleColorChange('Bleu');
    }
    for (const plate of ['', '   ', '---']) {
      f.render().handleVehiclePlateChange(plate); await f.render().handleSaveVehicle();
      assert.equal(f.calls.length, 0);
      assert.ok(f.render().vehicleFormError);
      assert.equal(f.render().vehicleModalVisible, true);
    }
    f.render().setVehicleType('motorcycle_two_wheels');
    f.render().handleVehiclePlateChange('moto-001');
    assert.equal(f.render().vehiclePlate, 'MOTO001');
    await f.render().handleSaveVehicle();
    assert.equal(f.calls.length, 1);
    const call = f.calls[0]; assert.equal(call.kind, editing ? 'update' : 'create');
    assert.equal((editing ? call.payload.data : call.payload).licensePlate, 'MOTO001');
    assert.equal((editing ? call.payload.data : call.payload).type, 'motorcycle_two_wheels');
    if (editing) assert.equal(call.payload.id, vehicle.id);
    f.hooks.unmount();
  });
}

test('vehicle creation during publication accepts a three-wheel motorcycle plate without changing trip selection', async () => {
  const calls = [], errors = [], selections = [];
  const { usePublishVehicleCreation } = loader({ 'react-native': { Keyboard: { dismiss: noop } } })('hooks/publish/usePublishVehicleCreation.ts');
  const props = { vehicleType: 'motorcycle_three_wheels', vehicleBrand: 'TVS', vehicleModel: 'King', vehicleColor: 'Bleu',
    vehicleLicensePlate: '---', setVehicleFormError: error => errors.push(error),
    createVehicle: payload => ({ unwrap: async () => { calls.push(payload); return vehicle; } }),
    setIsFinalizingVehicleCreation: noop, setCreatedVehicle: noop, setSelectedVehicleId: id => selections.push(id),
    setVehicleCreationMessage: noop, setShowVehicleForm: noop, resetVehicleForm: noop,
    refetchProfile: async () => ({}), refetchVehicles: async () => ({}) };
  await usePublishVehicleCreation(props).handleCreateVehicle();
  assert.equal(calls.length, 0); assert.equal(errors.at(-1), VEHICLE_PLATE_FORMAT_MESSAGE);
  props.vehicleLicensePlate = 'trike-001';
  await usePublishVehicleCreation(props).handleCreateVehicle();
  assert.equal(calls[0].licensePlate, 'TRIKE001'); assert.deepEqual(selections, ['vehicle']);
});

function signupFixture() {
  const hooks = hookHarness();
  const calls = [], dialogs = [], steps = [];
  const mutation = method => payload => ({ unwrap: async () => { calls.push({ method, payload }); return { accessToken: 'test', refreshToken: 'test' }; } });
  const load = loader({
    react: hooks.react,
    'react-native': { Platform: { OS: 'ios' } }, 'expo-image-picker': {},
    '@/hooks/useAppIsActive': { useScreenIsActive: () => false },
    '@/features/profile/profilePhotoRecovery': { claimPendingProfileImageUri: async () => null },
    '@/hooks/profile/useProfilePhotoSelection': { useProfilePhotoSelection: () => ({ choosePhoto: async () => null, isSelecting: false }) },
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
    dispatch: () => ({ unwrap: async () => true }), startDiditKyc: async () => {}, router: { replace: noop },
  };
  for (const key of ['GoogleIdToken', 'GoogleProfileName', 'GoogleFirstName', 'GoogleLastName', 'GoogleEmail',
    'GooglePhone', 'GoogleOtp', 'GoogleFlow', 'IsGooglePhoneVerified', 'SocialProvider', 'AppleNonce']) props[`set${key}`] = noop;
  return { calls, dialogs, steps, props, load, hooks };
}

test('signup profile rejects an empty normalized plate and accepts variable formats; passengers require no vehicle', () => {
  const f = signupFixture(); const { useSignupProfileActions } = f.load('hooks/auth/useSignupProfileActions.ts');
  f.props.vehiclePlate = '---';
  useSignupProfileActions(f.props).validateProfileAndContinue();
  assert.deepEqual(f.steps, []); assert.equal(f.dialogs.at(-1).message, VEHICLE_PLATE_FORMAT_MESSAGE);
  f.props.vehiclePlate = 'moto-001'; f.props.vehicleType = 'motorcycle_two_wheels'; useSignupProfileActions(f.props).validateProfileAndContinue();
  assert.deepEqual(f.steps, ['kyc']);
  f.props.role = 'passenger'; f.props.vehiclePlate = ''; f.props.vehicleType = null;
  useSignupProfileActions(f.props).validateProfileAndContinue();
  assert.deepEqual(f.calls, ['register-from-profile']);
});

for (const method of ['phone', 'google', 'apple']) {
  test(`${method} final registration revalidates and normalizes the plate before sending`, async () => {
    const f = signupFixture(); const { useRegistrationActions } = f.load('hooks/auth/useRegistrationActions.ts');
    if (method !== 'phone') Object.assign(f.props, { googleIdToken: 'test', isGooglePhoneVerified: true, socialProvider: method });
    f.props.vehiclePlate = '---';
    await f.hooks.render(() => useRegistrationActions(f.props)).handleFinalRegister();
    assert.equal(f.calls.length, 0); assert.equal(f.dialogs.at(-1).message, VEHICLE_PLATE_FORMAT_MESSAGE);
    f.props.vehiclePlate = 'moto-12345'; f.props.vehicleType = 'motorcycle_two_wheels';
    await f.hooks.render(() => useRegistrationActions(f.props)).handleFinalRegister();
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].method, method);
    const payload = f.calls[0].payload;
    assert.equal(method === 'phone' ? payload.get('vehicle[licensePlate]') : payload.vehicle.licensePlate, 'MOTO12345');
    f.hooks.unmount();
    const passenger = signupFixture();
    Object.assign(passenger.props, { role: 'passenger', vehiclePlate: '', vehicleType: null,
      googleIdToken: f.props.googleIdToken, isGooglePhoneVerified: f.props.isGooglePhoneVerified, socialProvider: f.props.socialProvider });
    const passengerHook = passenger.load('hooks/auth/useRegistrationActions.ts').useRegistrationActions;
    await passenger.hooks.render(() => passengerHook(passenger.props)).handleFinalRegister();
    const passengerPayload = passenger.calls[0].payload;
    assert.equal(method === 'phone' ? passengerPayload.has('vehicle[licensePlate]') : Boolean(passengerPayload.vehicle), false);
    passenger.hooks.unmount();
  });
}

const elements = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(elements) : [node, ...elements(node.props?.children)];
for (const auth of [false, true]) {
  test(`${auth ? 'signup' : 'shared create/update'} plate field has a label, no placeholder or format hint, and accepts variable lengths`, () => {
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
    for (const plate of ['', 'ABC123', 'MOTO001', 'TRIKE001', '1234AB567', '1234AB56']) {
      props.vehiclePlate = plate; props.licensePlate = plate;
      const tree = hooks.render(() => Component(props));
      const input = elements(tree).find(node => node.props?.accessibilityLabel === "Plaque d'immatriculation");
      assert.equal(input.props.placeholder, undefined); assert.equal(input.props.autoCorrect, false);
      assert.ok(elements(tree).some(node => node.type === 'Text' && node.props.children === 'Immatriculation'));
      assert.ok(!elements(tree).some(node => node.type?.name === 'VehiclePlateHint'));
      const labels = elements(tree).filter(node => node.type === 'Text').map(node => node.props.children).join(' ');
      assert.doesNotMatch(labels, /Aucun format imposé|Saisissez la plaque|4 chiffres|MOTO123/);
      assert.equal(input.props.maxLength, undefined);
      const button = elements(tree).filter(node => node.type === 'Button').at(-1);
      assert.equal(button.props.disabled, plate === '');
      input.props.onChangeText('1234 ab 56'); assert.equal(changes.at(-1), '1234AB56');
    }
    hooks.unmount();
  });
}
