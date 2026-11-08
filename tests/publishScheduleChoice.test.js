const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture(t, platform = 'android') {
  const h = hookHarness(), opened = [], dismissed = [];
  const props = { isScreenActive: true, departureDateTime: null, hasChosenDepartureTime: false,
    recurringEndDate: null, iosPickerMode: null, iosPickerTarget: 'departure', iosPickerValue: new Date() };
  for (const key of Object.keys(props)) props['set' + key[0].toUpperCase() + key.slice(1)] = next => {
    props[key] = typeof next === 'function' ? next(props[key]) : next;
  };
  const native = { open: value => opened.push(value), dismiss: async mode => dismissed.push(mode) };
  const hook = loader({ react: h.react, 'react-native': { Platform: { OS: platform }, Keyboard: { dismiss() {} } },
    '@react-native-community/datetimepicker': { DateTimePickerAndroid: native },
  })('hooks/publish/usePublishScheduleActions.ts').usePublishScheduleActions;
  const render = () => h.render(() => hook(props)); t.after(() => h.unmount());
  return { props, opened, dismissed, native, render, h };
}

test('publication date alone never confirms a suggested time; choosing time preserves the date', t => {
  const f = fixture(t); f.render().openDateOrTimePicker('date');
  f.opened[0].onChange({ type: 'set' }, new Date(2026, 11, 18)); f.render();
  assert.equal(f.props.departureDateTime.getDate(), 18); assert.equal(f.props.hasChosenDepartureTime, false);
  f.render().openDateOrTimePicker('time');
  f.opened[1].onChange({ type: 'set' }, new Date(2026, 10, 6, 17, 45));
  assert.equal(f.props.departureDateTime.getMonth(), 11); assert.equal(f.props.departureDateTime.getHours(), 17);
  assert.equal(f.props.departureDateTime.getMinutes(), 45); assert.equal(f.props.hasChosenDepartureTime, true);
});

test('time can be chosen first for today, without requiring a calendar interaction', t => {
  const f = fixture(t); f.render().openDateOrTimePicker('time');
  assert.equal(f.opened[0].is24Hour, true);
  const picked = new Date(); picked.setHours(18, 30, 0, 0);
  f.opened[0].onChange({ type: 'set' }, picked);
  assert.equal(f.props.departureDateTime.toDateString(), picked.toDateString()); assert.equal(f.props.hasChosenDepartureTime, true);
});

test('Android cancellation and double taps do not set a date or open multiple dialogs', t => {
  const f = fixture(t), actions = f.render(); actions.openDateOrTimePicker('time'); actions.openDateOrTimePicker('time');
  assert.equal(f.opened.length, 1);
  f.opened[0].onChange({ type: 'dismissed' }, new Date());
  assert.equal(f.props.departureDateTime, null); assert.equal(f.props.hasChosenDepartureTime, false);
});

test('native errors are visible and retryable, and late callbacks after blur are ignored', t => {
  const f = fixture(t); f.native.open = () => { throw new Error('Unavailable native module'); };
  f.render().openDateOrTimePicker('time'); assert.match(f.render().pickerError, /Réessayez/);
  f.native.open = value => f.opened.push(value); f.render().openDateOrTimePicker('time');
  assert.equal(f.render().pickerError, null);
  f.props.isScreenActive = false; f.render(); f.opened[0].onChange({ type: 'set' }, new Date());
  assert.equal(f.props.departureDateTime, null); assert.deepEqual(f.dismissed, ['time']);
});

test('iOS waits for Valider; Annuler and an old confirmation preserve the chosen schedule', t => {
  const f = fixture(t, 'ios'); f.render().openDateOrTimePicker('time');
  f.render().handleIosPickerChange({ type: 'set' }, new Date(2026, 10, 6, 16, 10));
  assert.equal(f.props.departureDateTime, null);
  const old = f.render(); old.closeIosPicker(); old.confirmIosPicker();
  assert.equal(f.props.departureDateTime, null);
  f.render().openDateOrTimePicker('time'); f.render().handleIosPickerChange({ type: 'set' }, new Date(2026, 10, 6, 17, 20));
  f.render().confirmIosPicker();
  assert.equal(f.props.hasChosenDepartureTime, true); assert.equal(f.props.departureDateTime.getHours(), 17);
  assert.equal(f.props.iosPickerMode, null);
});

test('recurring end date keeps its own minimum and never changes or confirms departure time', t => {
  const f = fixture(t); f.props.departureDateTime = new Date(2026, 11, 18, 14);
  f.render().openDateOrTimePicker('date', 'recurringEndDate');
  assert.equal(f.opened[0].minimumDate, f.props.departureDateTime);
  f.opened[0].onChange({ type: 'set' }, new Date(2027, 0, 20, 14));
  assert.equal(f.props.recurringEndDate.getHours(), 0); assert.equal(f.props.departureDateTime.getMonth(), 11);
  assert.equal(f.props.hasChosenDepartureTime, false);
});

test('publication shares the request fields and picker without a duplicate step footer', () => {
  const calls = [], load = loader({ 'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button',
    StyleSheet: { create: value => value } }, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/reanimated': { default: { View: 'Animated' } },
    '@react-native-community/datetimepicker': { default: 'DateTimePicker' },
    '@/components/forms/FormLayout': { FormModal: 'FormModal' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 24 }) },
  });
  const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
  const { PublishScheduleStep } = load('features/publish/PublishScheduleStep.tsx');
  const props = { formattedDateLabel: 'Aujourd’hui', formattedTimeLabel: 'Choisir l’heure', hasChosenDepartureTime: false,
    insets: { bottom: 24 }, handleNextStep: () => calls.push('continue'), openDateOrTimePicker: mode => calls.push(mode) };
  const fields = load('components/forms/DepartureDateTimeFields.tsx').DepartureDateTimeFields;
  const tree = PublishScheduleStep(props);
  assert.ok(all(tree).some(node => node.type === fields));
  assert.equal(all(tree).filter(node => node.type === 'Button').length, 0);
  all(tree).find(node => node.type === fields).props.onOpen('time');
  assert.deepEqual(calls, ['time']);
  const modal = load('features/publish/PublishDateTimeModal.tsx').PublishDateTimeModal({ iosPickerMode: 'date', iosPickerTarget: 'recurringEndDate',
    departureDateTime: new Date(2026, 11, 18), closeIosPicker() {} });
  assert.equal(modal.type, load('components/trip-request/RequestDatePickerModal.tsx').RequestDatePickerModal);
  assert.equal(modal.props.title, 'Date de fin'); assert.equal(modal.props.insets.bottom, 24);
});
