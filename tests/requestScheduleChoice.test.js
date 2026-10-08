const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const model = loader()('features/trip-request/requestFormModel.ts');

function fixture(t, platform = 'android') {
  const hooks = hookHarness(), opened = [], dismissed = [];
  const props = { isScreenActive: true, timePreset: 'custom', hasChosenDepartureTime: false,
    departureDateMin: new Date(2026, 9, 9, 12, 30), flexibilityMinutes: 30 };
  const mutations = [];
  for (const field of ['timePreset', 'departureDateMin', 'flexibilityMinutes', 'hasChosenDepartureTime']) {
    props['set' + field[0].toUpperCase() + field.slice(1)] = next => {
      props[field] = typeof next === 'function' ? next(props[field]) : next; mutations.push(field);
    };
  }
  const native = { open: value => opened.push(value), dismiss: async mode => { dismissed.push(mode); return true; } };
  const { useRequestSchedule } = loader({ react: hooks.react,
    'react-native': { Keyboard: { dismiss() {} }, Platform: { OS: platform } },
    '@react-native-community/datetimepicker': { DateTimePickerAndroid: native },
  })('hooks/trip-request/useRequestSchedule.ts');
  const render = () => hooks.render(() => useRequestSchedule(props));
  t.after(() => hooks.unmount());
  return { props, render, opened, dismissed, mutations, hooks, native };
}

test('unselected custom and selected planned times never start the relative-time refresh timer', t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: new Date(2026, 9, 8, 12).getTime() });
  const f = fixture(t); f.render(); t.mock.timers.tick(120000);
  assert.deepEqual(f.mutations, []); assert.equal(f.render().timeSummary, '');
  f.props.hasChosenDepartureTime = true; f.render(); t.mock.timers.tick(120000);
  assert.deepEqual(f.mutations, []); assert.equal(f.props.departureDateMin.getDate(), 9);
});

test('Android date and time selection is explicit and preserves the complementary part', t => {
  const f = fixture(t); f.render().openCustomPicker('date');
  assert.equal(f.opened[0].mode, 'date'); assert.ok(f.opened[0].minimumDate);
  f.opened[0].onChange({ type: 'set' }, new Date(2026, 10, 15, 0));
  assert.equal(f.props.departureDateMin.getMonth(), 10); assert.equal(f.props.departureDateMin.getDate(), 15);
  assert.equal(f.props.departureDateMin.getHours(), 12); assert.equal(f.props.hasChosenDepartureTime, false);
  f.render().openCustomPicker('time');
  assert.equal(f.opened[1].is24Hour, true);
  f.opened[1].onChange({ type: 'set' }, new Date(2026, 9, 8, 17, 45, 32));
  assert.equal(f.props.hasChosenDepartureTime, true); assert.equal(f.props.timePreset, 'custom');
  const window = f.render().getCurrentDepartureWindow();
  assert.equal(window.min.getDate(), 15); assert.equal(window.min.getMonth(), 10);
  assert.equal(window.min.getHours(), 17); assert.equal(window.min.getMinutes(), 45); assert.equal(window.min.getSeconds(), 0);
  assert.equal(window.max.getTime() - window.min.getTime(), 30 * 60000);
});

test('Android cancellation keeps the previous schedule even when native returns its original value', t => {
  const f = fixture(t); f.props.timePreset = 'now'; f.props.hasChosenDepartureTime = true;
  f.render(); f.mutations.length = 0;
  f.render().openCustomPicker('time');
  f.opened[0].onChange({ type: 'dismissed' }, new Date(2026, 10, 10));
  assert.equal(f.props.timePreset, 'now'); assert.deepEqual(f.mutations, []);
  f.render().openCustomPicker('time'); assert.equal(f.opened.length, 2);
});

test('iOS edits are staged, cancellation discards them, and Valider confirms the unchanged suggestion', t => {
  const f = fixture(t, 'ios'); const original = f.props.departureDateMin.getTime();
  f.render().openCustomPicker('time'); let picker = f.render();
  picker.handleIosPickerChange({ type: 'set' }, new Date(2026, 9, 9, 18, 15));
  assert.deepEqual(f.mutations, []); assert.equal(f.props.departureDateMin.getTime(), original);
  f.render().closeDatePicker(); assert.equal(f.render().iosPickerMode, null);
  assert.equal(f.props.hasChosenDepartureTime, false);
  f.render().openCustomPicker('time'); picker = f.render();
  const suggestion = picker.iosPickerValue;
  picker.confirmIosPicker();
  assert.equal(f.props.hasChosenDepartureTime, true); assert.equal(f.render().iosPickerMode, null);
  assert.equal(f.props.departureDateMin.getHours(), suggestion.getHours());
  assert.equal(f.props.departureDateMin.getMinutes(), suggestion.getMinutes());
});

test('iOS selected date then selected time survive confirmation without replacing the selected day', t => {
  const f = fixture(t, 'ios'); f.render().openCustomPicker('date');
  f.render().handleIosPickerChange({ type: 'set' }, new Date(2026, 11, 25));
  f.render().confirmIosPicker(); assert.equal(f.props.hasChosenDepartureTime, false);
  f.render().openCustomPicker('time'); f.render().handleIosPickerChange({ type: 'set' }, new Date(2026, 9, 8, 23, 45));
  f.render().confirmIosPicker(); const result = f.render();
  assert.equal(f.props.departureDateMin.getDate(), 25); assert.equal(f.props.departureDateMin.getMonth(), 11);
  assert.equal(f.props.departureDateMin.getHours(), 23); assert.equal(f.props.departureDateMin.getMinutes(), 45);
  assert.match(result.timeSummary, /26 décembre/); assert.match(result.timeSummary, /00:15/);
});

test('only an explicit shortcut selects Maintenant or Dans 30 min', t => {
  const f = fixture(t); f.render(); assert.equal(f.props.hasChosenDepartureTime, false);
  f.render().applyPreset('now'); assert.equal(f.props.hasChosenDepartureTime, true); assert.equal(f.props.timePreset, 'now');
  f.render().applyPreset('soon'); assert.equal(f.props.timePreset, 'soon');
  const window = f.render().getCurrentDepartureWindow();
  assert.ok(window.min.getTime() >= Date.now() + 29 * 60000);
});

test('an obsolete iOS picker callback cannot edit or close a newly opened picker', t => {
  const f = fixture(t, 'ios'); f.render().openCustomPicker('date'); const previous = f.render();
  previous.closeDatePicker(); f.render().openCustomPicker('time');
  const current = f.render(), expected = current.iosPickerValue.getTime();
  previous.handleIosPickerChange({ type: 'set' }, new Date(2027, 0, 1)); previous.confirmIosPicker();
  assert.equal(f.render().iosPickerMode, 'time'); assert.equal(f.render().iosPickerValue.getTime(), expected);
  assert.deepEqual(f.mutations, []);
});

test('Android repeated same-frame taps do not create competing native dialogs', t => {
  const f = fixture(t), view = f.render(); view.openCustomPicker('date'); view.openCustomPicker('time');
  assert.equal(f.opened.length, 1);
});

for (const platform of ['android', 'ios']) for (const interruption of ['blur', 'unmount', 'close']) {
  test(`${platform}: late picker events cannot change the schedule after ${interruption}`, t => {
    const f = fixture(t, platform); f.render().openCustomPicker('time');
    const picker = f.render();
    if (interruption === 'blur') { f.props.isScreenActive = false; f.render(); }
    else if (interruption === 'unmount') f.hooks.unmount();
    else picker.closeDatePicker();
    if (platform === 'android') {
      f.opened[0].onChange({ type: 'set' }, new Date(2026, 9, 9, 18, 15));
      assert.deepEqual(f.dismissed, ['time']);
    } else {
      picker.handleIosPickerChange({ type: 'set' }, new Date(2026, 9, 9, 18, 15));
      picker.confirmIosPicker();
    }
    assert.deepEqual(f.mutations, []); assert.equal(f.props.hasChosenDepartureTime, false);
  });
}

test('Android native opening failure releases the lock and allows retry without a false selection', t => {
  const f = fixture(t); f.native.open = () => { throw new Error('native unavailable'); };
  f.render().openCustomPicker('time'); assert.ok(f.render().pickerError); assert.deepEqual(f.mutations, []);
  f.native.open = value => f.opened.push(value);
  f.render().openCustomPicker('time'); assert.equal(f.render().pickerError, null);
  f.opened[0].onError(new Error('native error')); assert.ok(f.render().pickerError);
  f.render().openCustomPicker('time'); assert.equal(f.opened.length, 2);
});

test('the last day of a month and next-year labels use calendar dates, not 24-hour offsets', () => {
  assert.equal(model.formatRequestDayLabel(new Date(2026, 9, 8), new Date(2026, 9, 8, 18)), 'Aujourd’hui');
  assert.equal(model.formatRequestDayLabel(new Date(2027, 0, 1), new Date(2026, 11, 31, 23)), 'Demain');
  assert.match(model.formatRequestDayLabel(new Date(2027, 0, 2), new Date(2026, 11, 31)), /2027/);
  assert.equal(model.applyDatePart(new Date(2026, 1, 28), new Date(2026, 0, 31, 13, 15)).getDate(), 28);
  assert.ok(model.FLEX_OPTIONS.every(value => value > 0));
});

const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(words).join('') : words(node?.props?.children ?? '');
const native = { Text: 'Text', View: 'View', TouchableOpacity: 'Button', StyleSheet: { create: x => x } };

test('date/time remain accessible without quick shortcuts, and flexibility is collapsed', () => {
  const hooks = hookHarness(), calls = [];
  const { RequestScheduleFields } = loader({ react: hooks.react, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/reanimated': { default: { View: 'Animated' }, FadeIn: {}, FadeOut: {} },
  })('components/trip-request/RequestScheduleFields.tsx');
  const props = { departureDateMin: new Date(), hasChosenDepartureTime: false, timePreset: 'custom', flexibilityMinutes: 30,
    openCustomPicker: mode => calls.push(mode), setFlexibilityMinutes: value => calls.push(value) };
  const render = () => hooks.render(() => RequestScheduleFields(props));
  let tree = render(); assert.match(words(tree), /Départ souhaité/); assert.match(words(tree), /Choisir l’heure/);
  let buttons = all(tree).filter(n => n.type === 'Button');
  assert.equal(buttons.filter(b => b.props.accessibilityRole === 'radio' && b.props.accessibilityState.checked).length, 0);
  buttons.find(b => b.props.accessibilityLabel?.startsWith('Date de départ')).props.onPress();
  buttons.find(b => b.props.accessibilityLabel?.startsWith('Heure de départ')).props.onPress();
  assert.deepEqual(calls, ['date', 'time']);
  assert.equal(buttons.some(b => words(b) === 'Maintenant' || words(b) === 'Dans 30 min'), false);
  assert.equal(buttons.some(b => b.props.accessibilityLabel?.startsWith('Attendre')), false);
  buttons.find(b => words(b).startsWith('Je peux attendre')).props.onPress();
  tree = render(); buttons = all(tree).filter(n => n.type === 'Button');
  assert.equal(buttons.filter(b => b.props.accessibilityLabel?.startsWith('Attendre')).length, 4);
  assert.equal(words(tree).includes('Exact'), false);
  props.timePreset = 'now'; props.hasChosenDepartureTime = true; tree = render();
  assert.equal(all(tree).filter(b => b.type === 'Button' && b.props.accessibilityLabel?.includes('de départ')).length, 2);
  hooks.unmount();
});

test('iOS uses the shared in-app picker overlay with distinct cancel and confirm actions', () => {
  const calls = [];
  const { RequestDatePickerModal } = loader({ 'react-native': { ...native, Platform: { OS: 'ios' } },
    '@/components/forms/FormLayout': { FormModal: 'FormModal' },
    '@react-native-community/datetimepicker': { default: 'DateTimePicker' },
  })('components/trip-request/RequestDatePickerModal.tsx');
  const tree = RequestDatePickerModal({ iosPickerValue: new Date(), iosPickerMode: 'time', insets: { bottom: 0 },
    closeDatePicker: () => calls.push('cancel'), confirmIosPicker: () => calls.push('confirm'), handleIosPickerChange() {} });
  assert.equal(tree.type, 'FormModal'); assert.equal(tree.props.inApp, true); assert.equal(tree.props.visible, true);
  const buttons = all(tree).filter(n => n.type === 'Button');
  buttons.find(b => words(b) === 'Annuler').props.onPress();
  buttons.find(b => words(b) === 'Valider').props.onPress();
  assert.deepEqual(calls, ['cancel', 'confirm']);
});

test('primary action opens time selection first, then submits planned or immediate requests explicitly', async () => {
  const hooks = hookHarness(), calls = [];
  const draft = { hasChosenDepartureTime: false, timePreset: 'custom' };
  const { useRequestTripController } = loader({ react: { ...hooks.react, startTransition: fn => fn() },
    './useRequestDraft': { useRequestDraft: () => draft },
    './useRequestSchedule': { useRequestSchedule: () => ({ openCustomPicker: mode => calls.push(mode) }) },
    './useRequestSubmission': { useRequestSubmission: () => ({ isCreating: false, handleCreateRequest: async () => calls.push('submit') }) },
    './useRequestRouteEffects': { useRequestRouteEffects: () => ({}) },
    './useRequestQuickPlaces': { useRequestQuickPlaces: () => ({}) },
    './useRequestBudgetSummary': { useRequestBudgetSummary: () => ({ hasDepartureAddress: true, hasArrivalAddress: true, canSubmitRequestDetails: true }) },
    './useRequestRoutePrefill': { useRequestRoutePrefill: () => ({}) },
    '@/hooks/useUserLocation': { useUserLocation: () => ({}) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/api/googleMapsApi': { useGeocodeMutation: () => [() => {}] },
    '@/store/api/userApi': { useGetFavoriteLocationsQuery: () => ({}) },
    'expo-router': { useLocalSearchParams: () => ({}), useRouter: () => ({}) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({}) },
  })('hooks/trip-request/useRequestTripController.ts');
  const render = () => hooks.render(useRequestTripController);
  render().setRequestFormStep('details');
  assert.equal(render().primaryLabel, 'Choisir l’heure de départ');
  await render().handlePrimaryAction(); assert.deepEqual(calls, ['time']);
  draft.hasChosenDepartureTime = true;
  assert.equal(render().primaryLabel, 'Envoyer la demande');
  await render().handlePrimaryAction(); assert.deepEqual(calls, ['time', 'submit']);
  draft.timePreset = 'now'; assert.equal(render().primaryLabel, 'Chercher un chauffeur');
  hooks.unmount();
});
