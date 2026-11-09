const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { publishCompactFixture } = require('./helpers/publishCompactFixture.cjs');
const noop = () => {};
const base = { 'react-native': { Platform: { OS: 'android' } },
  'react-native-maps': {}, '@react-native-community/datetimepicker': {} };

function navigationFixture(overrides = {}) {
  const calls = [], dialogs = [], props = { step: 'route', stepNumber: 1, setStep: value => calls.push(value),
    hasDepartureAddress: true, hasArrivalAddress: true, setAddressSectionStep: value => calls.push(value),
    showDialog: value => dialogs.push(value), isPublishIdentityVerified: true, openKycModal: () => calls.push('identity'),
    departureDateTime: new Date(2030, 4, 12, 17, 30), isRecurringTrip: false, recurringWeekdays: [1],
    recurringEndDate: null, selectedVehicleId: 'car', isFreeTrip: false, price: '2000', acceptedPaymentModes: ['points'], ...overrides };
  const hook = loader(base)('hooks/publish/usePublishStepNavigation.ts').usePublishStepNavigation;
  return { calls, dialogs, props, next: () => hook(props).handleNextStep() };
}
test('route validates location, identity and time before entering vehicle/price', () => {
  const f = navigationFixture(); f.next(); assert.deepEqual(f.calls, ['pricing']);
  for (const patch of [{ hasDepartureAddress: false }, { hasArrivalAddress: false },
    { departureDateTime: null }, { departureDateTime: new Date(NaN) }]) {
    const invalid = navigationFixture(patch); invalid.next();
    assert.ok(!invalid.calls.includes('pricing')); assert.equal(invalid.dialogs.length, 1);
  }
  const kyc = navigationFixture({ isPublishIdentityVerified: false }); kyc.next();
  assert.deepEqual(kyc.calls, ['identity']);
});
test('merged route stage still validates recurring weekdays and end date', () => {
  for (const patch of [{ recurringWeekdays: [] }, { recurringEndDate: new Date(2030, 4, 11) }]) {
    const invalid = navigationFixture({ isRecurringTrip: true, ...patch }); invalid.next();
    assert.equal(invalid.calls.length, 0); assert.equal(invalid.dialogs.length, 1);
  }
  const valid = navigationFixture({ isRecurringTrip: true, recurringEndDate: new Date(2030, 4, 12) }); valid.next();
  assert.deepEqual(valid.calls, ['pricing']);
});
test('merged price stage requires a vehicle and valid fare, preserving free trips', () => {
  for (const patch of [{ selectedVehicleId: null }, ...['', '0', '-1', 'bad', 'Infinity', '0x10'].map(price => ({ price }))]) {
    const f = navigationFixture({ step: 'pricing', ...patch }); f.next();
    assert.deepEqual(f.calls, []); assert.equal(f.dialogs.length, 1);
  }
  for (const patch of [{}, { price: '1e3' }, { price: '', isFreeTrip: true }]) {
    const f = navigationFixture({ step: 'pricing', ...patch }); f.next(); assert.deepEqual(f.calls, ['confirm']);
  }
});

function controllerFixture() {
  const state = publishCompactFixture(), hooks = hookHarness(), calls = [], captured = {};
  state.identity.startDiditKyc = async () => ({ status: 'approved' }); state.identity.setKycModalVisible = noop;
  const pieces = { VehicleState: state.vehicle, VehicleEditor: {}, FormState: state.form, Identity: state.identity,
    RoutePreview: state.route, Presentation: state.presentation, LocationActions: {}, SchedulePresentation: state.schedule,
    RouteResolution: {}, VehicleCreation: {}, SuccessActions: {},
    ScheduleActions: { openDateOrTimePicker: mode => calls.push(mode) }, Submission: { handlePublish: () => calls.push('publish') } };
  const mocks = Object.fromEntries(Object.entries(pieces).map(([name, value]) => [`./usePublish${name}`, {
    [`usePublish${name}`]: params => { captured[name] = params; return value; },
  }]));
  const load = loader({ ...base, ...mocks, react: { ...hooks.react, startTransition: callback => callback() },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    'expo-router': { useRouter: () => ({}), useLocalSearchParams: () => ({}) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/utils/reanimated': {}, '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => calls.push(value.title) }) },
    '@/hooks/useUserLocation': { useUserLocation: () => ({}) },
    '@/store/api/driverFinanceApi': { useLazyDriverFinanceSummaryQuery: () => [noop] },
    '@/store/api/tripApi': { useCreateTripMutation: () => [noop, {}], useCreateRecurringTripMutation: () => [noop, {}],
      useLazyGetMyRecurringTripsQuery: () => [noop], useLazyGetMyTripsQuery: () => [noop] },
  });
  return { state, calls, captured, render: () => hooks.render(load('hooks/publish/usePublishController.ts').usePublishController) };
}

test('empty payment selection blocks pricing immediately, but never blocks a free trip', () => {
  const f = navigationFixture({ step: 'pricing', acceptedPaymentModes: [] });
  f.next(); assert.deepEqual(f.calls, []); assert.equal(f.dialogs[0].title, 'Choisissez un paiement');
  f.props.isFreeTrip = true; f.next(); assert.deepEqual(f.calls, ['confirm']);
  f.calls.length = 0; f.props.isFreeTrip = false; f.props.acceptedPaymentModes = ['points'];
  f.next(); assert.deepEqual(f.calls, ['confirm']);
});

test('real controller passes the current payment selection to step validation', () => {
  const f = controllerFixture();
  f.render().handleFooterPrimary(); assert.equal(f.render().step, 'pricing');
  f.state.form.acceptedPaymentModes = [];
  f.render().handleFooterPrimary(); assert.equal(f.render().step, 'pricing');
  assert.deepEqual(f.calls, ['Choisissez un paiement']);
});
test('main footer opens the time picker on step one, then progresses in exactly three stages', () => {
  const f = controllerFixture(); f.state.form.hasChosenDepartureTime = false;
  let m = f.render(); assert.equal(m.footerPrimaryLabel, 'Choisir l’heure');
  assert.equal(f.captured.ScheduleActions.isScreenActive, true);
  m.handleFooterPrimary(); assert.deepEqual(f.calls, ['time']); assert.equal(f.render().step, 'route');
  f.state.form.hasChosenDepartureTime = true;
  f.render().handleFooterPrimary(); m = f.render(); assert.equal(m.step, 'pricing');
  assert.equal(f.captured.ScheduleActions.isScreenActive, false); assert.equal(m.previousStep, 'route');
  m.handleFooterPrimary(); m = f.render(); assert.equal(m.step, 'confirm'); assert.equal(m.previousStep, 'pricing');
  m.handleFooterPrimary(); assert.deepEqual(f.calls, ['time', 'publish']);
});
test('returning to either step preserves the entered values and does not publish', () => {
  const f = controllerFixture(); f.render().navigation.goToStep('confirm');
  f.render().navigation.goToStep('route'); let m = f.render();
  assert.equal(m.form.price, '2500'); assert.equal(m.form.departureDateTime.getHours(), 17);
  m.handleFooterPrimary(); m = f.render(); assert.equal(m.vehicle.selectedVehicleId, 'preview-car');
  assert.equal(m.form.seats, '3'); assert.deepEqual(f.calls, []);
});
test('identity approval cannot skip required recurring settings or hour choice', async () => {
  const f = controllerFixture(); f.state.form.isRecurringTrip = true; f.state.form.recurringWeekdays = [];
  await f.render().handleStartKyc(); let m = f.render(); assert.equal(m.step, 'route');
  m.handleFooterPrimary(); m = f.render(); assert.equal(m.step, 'route');
  assert.deepEqual(f.calls, ['Jours manquants']);
});
