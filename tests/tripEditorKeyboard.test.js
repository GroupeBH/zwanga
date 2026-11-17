const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { tripEditorFixture } = require('./helpers/tripEditorFixture.cjs');
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const style = value => Object.assign({}, ...(Array.isArray(value) ? value.flat(Infinity) : [value]).filter(Boolean));
function fixture(os) {
  const hooks = hookHarness(), props = tripEditorFixture();
  const load = loader({ react: hooks.react, 'react-native': {
    Platform: { OS: os }, StyleSheet: { create: v => v }, Keyboard: { dismiss() {} },
    Text: 'Text', TextInput: 'Input', View: 'View', ScrollView: 'Scroll', TouchableOpacity: 'Button',
    KeyboardAvoidingView: 'Keyboard', ActivityIndicator: 'Spinner',
  }, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@react-native-community/datetimepicker': { __esModule: true, default: 'DatePicker' },
  '@/components/forms/FormLayout': { FormModal: 'Modal' } });
  return { hooks, load, props };
}

for (const os of ['android', 'ios']) {
  test(`${os}: typing a reference keeps the same viewport, footer and keyboard strategy`, () => {
    const { hooks, load, props } = fixture(os);
    const Modal = load('features/trip-detail/TripEditModal.tsx').TripEditModal;
    let previous;
    for (const value of ['', 'D', 'De', 'Devant la pharmacie', '', 'Au portail']) {
      props.editReferences.departureReference = value;
      const tree = hooks.render(() => Modal(props));
      const avoiding = nodes(tree).filter(n => n.type === 'Keyboard');
      assert.equal(avoiding.length, os === 'ios' ? 1 : 0, 'Android already uses native adjustResize');
      if (os === 'ios') assert.equal(avoiding[0].props.behavior, 'padding');
      const sheet = nodes(tree).find(n => style(n.props?.style).borderTopLeftRadius === 24);
      assert.equal(style(sheet.props.style).height, os === 'ios' ? '100%' : '96%');
      assert.equal(style(sheet.props.style).minHeight, 0);
      const footer = nodes(tree).find(n => n.props?.testID === 'trip-edit-footer');
      assert.equal(style(footer.props.style).flexShrink, 0);
      const fields = nodes(tree).find(n => n.type.name === 'TripEditFields');
      assert.equal(fields.props.editReferences.departureReference, value);
      if (previous) {
        assert.equal(fields.type, previous.type); assert.equal(fields.key, previous.key);
        assert.equal(fields.props.scrollRef, previous.props.scrollRef, 'typing must not reset the scroll container');
      }
      previous = fields;
      const scroll = fields.type(fields.props);
      assert.equal(style(scroll.props.style).flex, 1);
      assert.equal(scroll.props.automaticallyAdjustKeyboardInsets, false);
      assert.equal(scroll.props.automaticallyAdjustContentInsets, false);
      assert.equal(scroll.props.contentInsetAdjustmentBehavior, 'never');
      assert.equal(nodes(scroll).some(n => n.props?.testID === 'trip-edit-footer'), false);
    }
    hooks.unmount();
  });

  test(`${os}: required reference guidance does not appear/disappear with each empty/nonempty edit`, () => {
    const { hooks, load, props } = fixture(os);
    const Fields = load('features/trips/TripEditReferenceFields.tsx').TripEditReferenceFields;
    const inputProps = { ...props, target: 'departure', departureAddress: 'Gombe', arrivalAddress: 'Gare Centrale' };
    inputProps.editDepartureSelection = { title: 'Gombe', address: 'Gombe' };
    for (const value of ['', 'P', 'Pharmacie', '', ' ']) {
      props.editReferences.departureReference = value;
      const component = nodes(Fields(inputProps)).find(n => typeof n.type === 'function');
      const field = hooks.render(() => component.type(component.props));
      const rendered = field.type(field.props), input = nodes(rendered).find(n => n.type === 'Input');
      assert.equal(input.props.value, value); assert.equal(input.props.maxLength, 200);
      assert.equal(nodes(rendered).filter(n => n.type === 'Text').length, 2, 'reserve the same guidance line while typing');
    }
    hooks.unmount();
  });

  test(`${os}: clearing a saved optional reference does not unmount the focused field`, () => {
    const { hooks, load, props } = fixture(os);
    const Fields = load('features/trips/TripEditReferenceFields.tsx').TripEditReferenceFields;
    const inputProps = { ...props, target: 'departure', departureAddress: 'Avenue des Aviateurs', arrivalAddress: 'Gare Centrale', showOptional: false };
    let previous;
    for (const value of ['Devant le portail', 'D', '', 'Nouveau repère']) {
      props.editReferences.departureReference = value;
      const component = nodes(Fields(inputProps)).find(n => typeof n.type === 'function');
      const field = hooks.render(() => component.type(component.props));
      assert.ok(field, 'the reference must remain editable after the last character is removed');
      if (previous) assert.equal(field.type, previous);
      previous = field.type;
      assert.equal(nodes(field.type(field.props)).find(n => n.type === 'Input').props.value, value);
    }
    hooks.unmount();
  });
}

test('outside trip editing, optional hints retain their previous conditional behavior', () => {
  const { load } = fixture('android');
  const Field = load('components/trip-request/RequestReferenceField.tsx').RequestReferenceField;
  for (const value of ['', 'Pharmacie']) {
    const tree = Field({ target: 'departure', value, required: true, onChangeText() {} });
    assert.equal(nodes(tree).filter(n => n.type === 'Text').length, value ? 1 : 2);
  }
});
