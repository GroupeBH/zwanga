const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { publishCompactFixture, hiddenPublishModals } = require('./helpers/publishCompactFixture.cjs');
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : Array.isArray(node) ? node.map(text).join(' ') : text(node?.props?.children ?? '');
const native = { View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'Button',
  Switch: 'Switch', ActivityIndicator: 'Spinner', KeyboardAvoidingView: 'Keyboard', Platform: { OS: 'android' }, StyleSheet: { create: s => s } };
const base = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/utils/reanimated': { default: { View: 'Animated' } },
  'react-native-maps': { __esModule: true, default: 'Map', Marker: 'Marker', Polyline: 'Polyline' },
  '@react-native-community/datetimepicker': {} };

test('three stages keep itinerary/date and vehicle/price together with one persistent footer', () => {
  for (const [step, expected] of [['route', ['PublishRouteStep', 'PublishScheduleStep']],
    ['pricing', ['PublishVehicleStep', 'PublishPricingStep']], ['confirm', ['PublishConfirmationStep']]]) {
    const model = publishCompactFixture(step);
    const names = ['PublishRouteStep', 'PublishScheduleStep', 'PublishVehicleStep', 'PublishPricingStep', 'PublishConfirmationStep'];
    const mocks = Object.fromEntries(names.map(name => [`../features/publish/${name}`, { [name]: name }]));
    const load = loader({ ...base, ...mocks, ...hiddenPublishModals,
      '../hooks/publish/usePublishController': { usePublishController: () => model },
      '@/components/forms/FormLayout': { FormScreen: 'Screen' },
      '@/components/LocationPickerModal': { default: 'LocationModal' }, '@/components/VehicleFormModal': { VehicleFormModal: 'VehicleModal' } });
    const nodes = all(load('app/publish.tsx').default());
    assert.deepEqual(nodes.filter(n => names.includes(n.type)).map(n => n.type), expected);
    assert.equal(nodes.filter(n => n.props.onPress === model.handleFooterPrimary).length, 1);
    assert.equal(nodes.find(n => n.type === 'ScrollView').key, step, 'new step starts at the top');
    if (step === 'confirm') assert.equal(nodes.find(n => n.type === 'PublishConfirmationStep').props.selectedVehicle.id, model.vehicle.selectedVehicleId);
  }
});

function componentFixture(name, props) {
  const hooks = hookHarness(), load = loader({ ...base, react: hooks.react });
  const Component = load(`features/publish/${name}.tsx`)[name];
  return { props, render: () => hooks.render(() => Component(props)) };
}
test('vehicle stays compact until Change, then selecting an option collapses it', () => {
  const model = publishCompactFixture(), chosen = [];
  const props = { ...model.vehicle, openVehicleForm() {}, setSelectedVehicleId: id => { props.selectedVehicleId = id; chosen.push(id); } };
  props.activeVehicles = [...props.activeVehicles, { ...props.activeVehicles[0], id: 'other-car', model: 'RAV4' }];
  const f = componentFixture('PublishVehicleStep', props);
  assert.equal(all(f.render()).filter(n => n.props.accessibilityRole === 'radio').length, 0);
  all(f.render()).find(n => n.props.accessibilityState?.expanded === false).props.onPress();
  let nodes = all(f.render());
  assert.equal(nodes.filter(n => n.props.accessibilityRole === 'radio').length, 2);
  nodes.filter(n => n.props.accessibilityRole === 'radio')[1].props.onPress();
  nodes = all(f.render());
  assert.deepEqual(chosen, ['other-car']);
  assert.equal(nodes.filter(n => n.props.accessibilityRole === 'radio').length, 0);
  assert.match(text(f.render()), /RAV4/);
});
test('loading and adding a first vehicle stay reachable without a separate stage', () => {
  let added = 0;
  const f = componentFixture('PublishVehicleStep', { activeVehicles: [], isLoadingVehicles: true, openVehicleForm: () => added++ });
  assert.ok(all(f.render()).some(n => n.type === 'Spinner'));
  f.props.isLoadingVehicles = false;
  all(f.render()).find(n => n.type === 'Button').props.onPress();
  assert.equal(added, 1);
});
test('confirmation includes every critical choice, allows edits and mounts the map only on request', () => {
  const m = publishCompactFixture(), edits = [];
  const f = componentFixture('PublishConfirmationStep', { ...m.form, ...m.presentation, ...m.route, ...m.schedule,
    selectedVehicle: m.vehicle.activeVehicles[0], publicationSuccess: null, goToStep: step => edits.push(step) });
  const initial = f.render();
  for (const content of ['Gare Centrale', 'Kintambo', '17:30', 'Toyota', 'Corolla', 'DEMO', '3', '500 FC / place', 'Jetons']) assert.ok(text(initial).includes(content), content);
  assert.equal(all(initial).filter(n => n.type === 'Map').length, 0);
  const editButtons = all(initial).filter(n => n.props.accessibilityLabel?.startsWith('Modifier'));
  editButtons.forEach(n => n.props.onPress()); assert.deepEqual(edits, ['route', 'pricing']);
  all(initial).find(n => n.props.accessibilityState?.expanded === false).props.onPress();
  assert.equal(all(f.render()).filter(n => n.type === 'Map').length, 1);
  f.props.isSubmittingTrip = true;
  assert.ok(all(f.render()).filter(n => n.props.accessibilityLabel?.startsWith('Modifier')).every(n => n.props.disabled));
});
test('recurrence, note, free fare and passenger verification are not dropped from the summary', () => {
  const m = publishCompactFixture();
  const f = componentFixture('PublishConfirmationStep', { ...m.form, ...m.presentation, ...m.route, ...m.schedule,
    publicationSuccess: null, isRecurringTrip: true, isFreeTrip: true, description: 'Petit bagage',
    requiresPassengerKyc: true, departureReference: 'Entrée principale' });
  const result = text(f.render());
  for (const content of ['Lun · Mer · Ven', 'Sans date de fin', 'Gratuit', 'Petit bagage', 'Passagers vérifiés', 'Entrée principale']) assert.ok(result.includes(content), content);
});
test('repeating a trip reveals weekdays and end-date controls only when enabled', () => {
  const m = publishCompactFixture(), selected = [];
  const f = componentFixture('PublishScheduleStep', { ...m.form, ...m.presentation, ...m.schedule,
    toggleRecurringWeekday: day => selected.push(day), setRecurringEndDate: day => selected.push(day) });
  assert.equal(all(f.render()).filter(n => n.props.accessibilityRole === 'checkbox').length, 0);
  f.props.isRecurringTrip = true; f.props.recurringEndDate = new Date(2030, 6, 1);
  const days = all(f.render()).filter(n => n.props.accessibilityRole === 'checkbox');
  assert.equal(days.length, 7); assert.equal(days[0].props.accessibilityState.checked, true);
  days[1].props.onPress();
  all(f.render()).find(n => n.props.accessibilityLabel === 'Retirer la date de fin').props.onPress();
  assert.deepEqual(selected, [2, null]);
});

test('compact route removes only redundant confirmation text, not actionable GPS warnings', () => {
  const hooks = hookHarness(), load = loader({ ...base, react: hooks.react });
  const hook = load('hooks/publish/usePublishPresentation.tsx').usePublishPresentation;
  const m = publishCompactFixture();
  const presentation = hooks.render(() => hook({ departureAddress: 'Gare Centrale', arrivalAddress: 'Kintambo Magasin',
    departureLocation: m.form.departureLocation, arrivalLocation: m.form.arrivalLocation }));
  assert.equal(presentation.renderGpsStatus(true, false, true, 'Départ'), null);
  assert.equal(presentation.renderGpsStatus(false, false, false, 'Départ'), null);
  assert.match(text(presentation.renderGpsStatus(true, true, false, 'Départ')), /vérifiez le point/);
  assert.match(text(presentation.renderGpsStatus(true, false, false, 'Départ')), /à confirmer/);
});
