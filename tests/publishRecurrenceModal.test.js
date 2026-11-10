const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { publishCompactFixture } = require('./helpers/publishCompactFixture.cjs');
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : Array.isArray(node) ? node.map(text).join(' ') : text(node?.props?.children ?? '');
function fixture(t, platform = 'android', overrides = {}) {
  const h = hookHarness(), saved = [], opened = [], dismissed = [];
  let active = true, closed = 0;
  const props = { departureDateTime: new Date(2030, 4, 13, 14), weekdays: [1, 3, 5], endDate: null,
    options: publishCompactFixture().presentation.recurringWeekdayOptions, enabled: true,
    onSave: choice => saved.push(choice), onClose: () => closed++, ...overrides };
  const load = loader({ react: h.react,
    'react-native': { View: 'View', ScrollView: 'Scroll', Text: 'Text', TouchableOpacity: 'Button',
      Platform: { OS: platform }, Keyboard: { dismiss() {} }, StyleSheet: { create: s => s } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/reanimated': { default: { View: 'Animated' } },
    '@react-native-community/datetimepicker': { __esModule: true, default: 'Picker', DateTimePickerAndroid: {
      open: config => opened.push(config), dismiss: async mode => dismissed.push(mode) } },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/components/forms/FormLayout': { FormModal: 'FormModal' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) },
  });
  const component = load('features/publish/PublishRecurrenceModal.tsx').PublishRecurrenceModal;
  const draw = () => h.render(() => component(props));
  const press = label => {
    const node = all(draw()).find(n => n.type === 'Button' && (n.props.accessibilityLabel === label || text(n) === label));
    assert.ok(node, label); node.props.onPress();
  };
  t.after(() => h.unmount());
  return { props, h, saved, opened, dismissed, draw, press, load, setActive: v => { active = v; }, get closed() { return closed; } };
}

test('recurrence is an in-app draft: cancelling after editing never changes the saved days', t => {
  const f = fixture(t);
  const modal = f.draw(); assert.equal(modal.type, 'FormModal'); assert.equal(modal.props.inApp, true);
  f.press('Mar'); f.press('Lun');
  assert.deepEqual(f.props.weekdays, [1, 3, 5]); assert.deepEqual(f.saved, []);
  f.press('Annuler la répétition'); assert.equal(f.closed, 1); assert.deepEqual(f.saved, []);
  modal.props.onRequestClose(); assert.equal(f.closed, 2);
});

test('save sorts selected days; an empty selection is blocked and recurrence can be removed explicitly', t => {
  const f = fixture(t); f.press('Mar'); f.press('Lun'); f.press('Enregistrer');
  assert.deepEqual(f.saved, [{ weekdays: [2, 3, 5], endDate: null }]);
  for (const day of ['Mar', 'Mer', 'Ven']) f.press(day);
  assert.equal(all(f.draw()).find(n => n.type === 'Button' && text(n) === 'Enregistrer').props.disabled, true);
  f.press('Enregistrer'); assert.equal(f.saved.length, 1);
  f.press('Ne plus répéter'); assert.equal(f.saved[1], null);
});

test('first recurrence suggests the departure weekday without enabling anything until save', t => {
  const f = fixture(t, 'android', { weekdays: [], enabled: false });
  const selected = all(f.draw()).filter(n => n.props.accessibilityRole === 'checkbox' && n.props.accessibilityState.checked);
  assert.deepEqual(selected.map(n => n.props.accessibilityLabel), ['Lun']);
  assert.deepEqual(f.saved, []); assert.doesNotMatch(text(f.draw()), /Ne plus répéter/);
  f.press('Enregistrer'); assert.deepEqual(f.saved[0].weekdays, [1]);
});

test('Android end date is local to the draft, preserves departure and ignores cancellation', t => {
  const f = fixture(t), start = f.props.departureDateTime.getTime();
  f.press('Date de fin : Sans date de fin'); f.press('Date de fin : Sans date de fin');
  assert.equal(f.opened.length, 1); assert.equal(f.opened[0].minimumDate.getTime(), start);
  f.opened[0].onChange({ type: 'dismissed' }, new Date(2030, 6, 1));
  f.press('Enregistrer'); assert.equal(f.saved[0].endDate, null);
  f.press('Date de fin : Sans date de fin');
  f.opened[1].onChange({ type: 'set' }, new Date(2030, 6, 1));
  assert.equal(f.props.endDate, null); f.press('Enregistrer');
  assert.equal(f.saved[1].endDate.getMonth(), 6); assert.equal(f.props.departureDateTime.getTime(), start);
});

test('iOS date selection uses the SAME in-app panel, commits explicitly and can be cancelled', t => {
  const f = fixture(t, 'ios'); f.press('Date de fin : Sans date de fin');
  let nodes = all(f.draw()); assert.equal(nodes.filter(n => n.type === 'FormModal').length, 1);
  assert.equal(nodes.filter(n => n.type === 'Picker').length, 1);
  assert.equal(nodes.find(n => n.type === 'Button' && text(n) === 'Enregistrer').props.disabled, true);
  nodes.find(n => n.type === 'Picker').props.onChange({ type: 'set' }, new Date(2030, 6, 1));
  f.press('Annuler la date'); f.press('Enregistrer'); assert.equal(f.saved[0].endDate, null);
  f.press('Date de fin : Sans date de fin'); nodes = all(f.draw());
  nodes.find(n => n.type === 'Picker').props.onChange({ type: 'set' }, new Date(2030, 6, 1));
  f.press('Choisir cette date'); assert.equal(all(f.draw()).filter(n => n.type === 'Picker').length, 0);
  f.press('Enregistrer'); assert.equal(f.saved[1].endDate.getMonth(), 6);
  f.press('Retirer la date de fin'); f.press('Enregistrer'); assert.equal(f.saved[2].endDate, null);
});

test('invalid end date and background save are blocked; old Android callbacks do not mutate after blur', t => {
  const f = fixture(t, 'android', { endDate: new Date(2029, 0, 1) });
  f.press('Enregistrer'); assert.deepEqual(f.saved, []); assert.match(text(f.draw()), /après le premier départ/);
  f.press('Retirer la date de fin'); f.press('Date de fin : Sans date de fin');
  f.setActive(false); assert.equal(f.draw().props.visible, false);
  f.opened[0].onChange({ type: 'set' }, new Date(2030, 6, 1));
  f.press('Enregistrer'); assert.deepEqual(f.saved, []); assert.deepEqual(f.dismissed, ['date']);
});

test('screen blur closes the repetition editor and returning does not reopen it', t => {
  const f = fixture(t), m = publishCompactFixture();
  const component = f.load('features/publish/PublishScheduleStep.tsx').PublishScheduleStep;
  const draw = () => f.h.render(() => component({ ...m.form, ...m.presentation, ...m.schedule, onSaveRecurrence() {} }));
  all(draw()).find(n => n.props.accessibilityLabel === 'Répéter ce trajet').props.onPress();
  assert.ok(all(draw()).some(n => n.type?.name === 'PublishRecurrenceModal'));
  f.setActive(false); assert.ok(!all(draw()).some(n => n.type?.name === 'PublishRecurrenceModal'));
  f.setActive(true); assert.ok(!all(draw()).some(n => n.type?.name === 'PublishRecurrenceModal'));
});
