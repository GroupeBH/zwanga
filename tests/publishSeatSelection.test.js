const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const { getPublishSeats } = loader()('features/publish/publishSeatPolicy.ts');

test('publication seats follow motorcycle types while cars start at four or keep a higher count', () => {
  assert.equal(getPublishSeats('4', 'motorcycle_2_wheels'), '2');
  assert.equal(getPublishSeats('4', 'motorcycle_3_wheels'), '3');
  assert.equal(getPublishSeats('2', 'car'), '4');
  assert.equal(getPublishSeats('6', 'car'), '6');
  assert.equal(getPublishSeats('invalid', 'car'), '4');
});

test('switching vehicles updates the same form immediately without losing a larger car choice', () => {
  const hooks = hookHarness();
  const { usePublishFormState } = loader({ react: hooks.react })('hooks/publish/usePublishFormState.ts');
  let type = 'car';
  const render = () => hooks.render(() => usePublishFormState(type));

  assert.equal(render().seats, '4');
  render().setSeats('6');
  assert.equal(render().seats, '6');
  type = 'motorcycle_2_wheels';
  assert.equal(render().seats, '2');
  type = 'motorcycle_3_wheels';
  assert.equal(render().seats, '3');
  type = 'car';
  assert.equal(render().seats, '6');
});

const native = {
  Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', View: 'View',
};
const uiLoader = loader({
  'react-native': native,
  '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/utils/reanimated': { default: { View: 'Animated.View' } },
  '@/constants/styles': { Colors: { gray: { 900: '#000' }, info: '#00f', primary: '#f60', white: '#fff' }, Spacing: { sm: 8, md: 16 } },
  '../screen-styles/app/publish/index': { styles: new Proxy({}, { get: (_, key) => key }) },
});
const { PublishPricingStep } = uiLoader('features/publish/PublishPricingStep.tsx');

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}

test('pricing step fixes motorcycle seats and lets car drivers add seats down to a minimum of four', () => {
  const props = {
    stepEntering: undefined, seats: '2', vehicleType: 'motorcycle_2_wheels',
    setSeats: value => { props.seats = value; }, isFreeTrip: false, price: '',
    setPrice() {}, setIsFreeTrip() {}, requiresPassengerKyc: false,
    setRequiresPassengerKyc() {}, description: '', setDescription() {},
    insets: { bottom: 0 }, goToStep() {}, handleNextStep() {},
  };
  const seatButtons = tree => nodes(tree).filter(node =>
    node.type === 'TouchableOpacity' && /une place/.test(node.props.accessibilityLabel ?? ''),
  );

  assert.equal(seatButtons(PublishPricingStep(props)).length, 0);
  props.vehicleType = 'motorcycle_3_wheels';
  props.seats = '3';
  assert.equal(seatButtons(PublishPricingStep(props)).length, 0);

  props.vehicleType = 'car';
  props.seats = '4';
  let buttons = seatButtons(PublishPricingStep(props));
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].props.disabled, true);
  buttons[1].props.onPress();
  assert.equal(props.seats, '5');
  buttons = seatButtons(PublishPricingStep(props));
  assert.equal(buttons[0].props.disabled, false);
  buttons[0].props.onPress();
  assert.equal(props.seats, '4');
});
