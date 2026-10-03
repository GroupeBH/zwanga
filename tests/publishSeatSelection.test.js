const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const { getPublishSeats, getDefaultPublishSeats } = loader()('features/publish/publishSeatPolicy.ts');

test('defaults follow vehicle types while manual choices stay within server capacities', () => {
  assert.equal(getDefaultPublishSeats('car'), '4');
  assert.equal(getDefaultPublishSeats('motorcycle_2_wheels'), '2');
  assert.equal(getDefaultPublishSeats('motorcycle_3_wheels'), '3');
  assert.equal(getPublishSeats('4', 'motorcycle_2_wheels'), '2');
  assert.equal(getPublishSeats('4', 'motorcycle_3_wheels'), '3');
  assert.equal(getPublishSeats('2', 'car'), '2');
  assert.equal(getPublishSeats('1', 'motorcycle_2_wheels'), '1');
  assert.equal(getPublishSeats('2', 'motorcycle_3_wheels'), '2');
  assert.equal(getPublishSeats('6', 'car'), '6');
  assert.equal(getPublishSeats('invalid', 'car'), '4');
  for (const type of ['car', 'motorcycle_2_wheels', 'motorcycle_3_wheels']) {
    for (const value of ['', 'NaN', 'Infinity', '1.5', '9007199254740992']) {
      assert.equal(getPublishSeats(value, type), getDefaultPublishSeats(type));
    }
    assert.equal(getPublishSeats('0', type), '1');
    assert.equal(getPublishSeats('-4', type), '1');
  }
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
  render().setSeats('1');
  assert.equal(render().seats, '1');
  type = 'motorcycle_3_wheels';
  assert.equal(render().seats, '3');
  render().setSeats(previous => String(Number(previous) - 1));
  assert.equal(render().seats, '2');
  type = 'car';
  assert.equal(render().seats, '6');
  type = 'motorcycle_2_wheels';
  assert.equal(render().seats, '1');
  type = 'motorcycle_3_wheels';
  assert.equal(render().seats, '2');
  render().resetSeats();
  assert.equal(render().seats, '3');
  type = 'car';
  assert.equal(render().seats, '4');
  hooks.unmount();
});

const native = {
  Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', View: 'View',
  StyleSheet: { create: value => value },
};
const uiLoader = loader({
  'react-native': native,
  '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/utils/reanimated': { default: { View: 'Animated.View' } },
  '@/constants/styles': { Colors: { gray: { 900: '#000' }, info: '#00f', primary: '#f60', white: '#fff' }, Spacing: { sm: 8, md: 16 } },
  '../screen-styles/app/publish/index': { styles: new Proxy({}, { get: (_, key) => key }) },
});
const { PublishPricingStep } = uiLoader('features/publish/PublishPricingStep.tsx');
const { PublishSeatSelector } = uiLoader('features/publish/PublishSeatSelector.tsx');

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}

test('all vehicles expose minus and plus; motorcycles respect capacity and cars can go below four', () => {
  const props = {
    stepEntering: undefined, seats: '2', vehicleType: 'motorcycle_2_wheels',
    setSeats: value => { props.seats = typeof value === 'function' ? value(props.seats) : value; }, isFreeTrip: false, price: '',
    setPrice() {}, setIsFreeTrip() {}, requiresPassengerKyc: false,
    setRequiresPassengerKyc() {}, description: '', setDescription() {},
    insets: { bottom: 0 }, goToStep() {}, handleNextStep() {},
  };
  const seatButtons = tree => nodes(tree).filter(node =>
    node.type === 'TouchableOpacity' && /une place/.test(node.props.accessibilityLabel ?? ''),
  );

  assert.ok(nodes(PublishPricingStep(props)).some(node => node.type === PublishSeatSelector));
  for (const type of ['motorcycle_2_wheels', 'motorcycle_3_wheels', 'car']) {
    props.vehicleType = type;
    props.seats = getDefaultPublishSeats(type);
    let buttons = seatButtons(PublishSeatSelector(props));
    assert.equal(buttons.length, 2);
    assert.equal(buttons[1].props.disabled, type !== 'car');
    buttons[0].props.onPress();
    assert.equal(props.seats, String(Number(getDefaultPublishSeats(type)) - 1));
    buttons = seatButtons(PublishSeatSelector(props));
    assert.equal(buttons[1].props.disabled, false);
    buttons[1].props.onPress();
    assert.equal(props.seats, getDefaultPublishSeats(type));
    props.seats = '1';
    assert.equal(seatButtons(PublishSeatSelector(props))[0].props.disabled, true);
    props.seats = '2';
    const minus = seatButtons(PublishSeatSelector(props))[0];
    minus.props.onPress(); minus.props.onPress();
    assert.equal(props.seats, '1', 'rapid taps cannot go below one');
  }
  props.vehicleType = 'car'; props.seats = '4';
  const plus = seatButtons(PublishSeatSelector(props))[1];
  plus.props.onPress(); plus.props.onPress();
  assert.equal(props.seats, '6', 'rapid taps use the current value');
});

for (const recurring of [false, true]) {
  test(`${recurring ? 'recurring' : 'single'} publication submits the adjusted count, not the vehicle default`, async () => {
    const payloads = [];
    const hooks = hookHarness();
    const { usePublishFormState } = loader({ react: hooks.react })('hooks/publish/usePublishFormState.ts');
    const form = () => hooks.render(() => usePublishFormState('motorcycle_3_wheels'));
    form().setSeats('1');
    const { usePublishSubmission } = loader({
      '../../features/publish/publishModel': { getLocationCoordinates: () => [15, -4], isUserDriver: () => true },
      '@/services/analytics': { trackEvent() {} },
    })('hooks/publish/usePublishSubmission.ts');
    const create = payload => { payloads.push(payload); return { unwrap: async () => ({ id: 'test-trip' }) }; };
    const props = {
      publishInFlightRef: { current: false }, isSubmittingTrip: false, hasDepartureAddress: true, hasArrivalAddress: true,
      seats: form().seats, price: '2500', departureDateTime: new Date('2030-01-01T12:00:00Z'), isDriver: true,
      selectedVehicleId: 'vehicle', isPublishIdentityVerified: true, requiresPassengerKyc: true,
      isRecurringTrip: recurring, recurringWeekdays: [1, 3], recurringEndDate: null,
      departureAddress: 'Départ fictif', arrivalAddress: 'Arrivée fictive', departureReference: '', arrivalReference: '',
      description: '', formatDateOnlyValue: date => date.toISOString().slice(0, 10), formatTimeOnlyValue: () => '12:00',
      createTrip: create, createRecurringTrip: create, setPublicationSuccess() {},
      showDialog() { assert.fail('unexpected validation failure'); },
    };
    await usePublishSubmission(props).handlePublish();
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].totalSeats, 1);
    assert.equal(payloads[0].pricePerSeat, 2500);
    assert.equal(payloads[0].requiresPassengerKyc, true);
    assert.equal(payloads[0].vehicleId, 'vehicle');
    hooks.unmount();
  });
}
