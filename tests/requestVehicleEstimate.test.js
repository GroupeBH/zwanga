const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { homeRequestFixture } = require('./helpers/homeRequestFixture.cjs');
const { skipToken } = require('@reduxjs/toolkit/query');
const mocks = {
  'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', TextInput: 'Input',
    ScrollView: 'Scroll', ActivityIndicator: 'Spinner', Platform: { OS: 'ios' }, StyleSheet: { create: x => x } },
  '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/utils/reanimated': { __esModule: true, default: { View: 'View' }, FadeIn: {} },
};
const load = loader(mocks);
const { requestVehicleEstimate } = load('features/trip-request/vehicleEstimate.ts');
const { HomeRequestChoices } = load('components/trip-request/HomeRequestChoices.tsx');
const { RequestRouteStep } = load('components/trip-request/RequestRouteStep.tsx');
const types = ['car', 'motorcycle_2_wheels', 'motorcycle_3_wheels'];
const quote = (vehicleType, recommendedTotalPrice, extra = {}) => ({ vehicleType, recommendedTotalPrice,
  recommendedPricePerSeat: recommendedTotalPrice / 2, availableForRequestedSeats: true, ...extra });
const prices = () => [quote(types[2], 3500), quote(types[0], 7000), quote(types[1], 2500)];
const state = (extra = {}) => homeRequestFixture({ vehicleOptions: prices(), numberOfSeats: 2,
  isVehicleOptionsError: false, favoriteSuggestions: [], showQuickLandmarks: false, ...extra });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes)
  : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const words = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree)
  : Array.isArray(tree) ? tree.map(words).join('') : React.isValidElement(tree) ? words(tree.props.children) : '';

test('each estimate matches its vehicle type, uses the server total once, and ignores the shared budget', () => {
  const form = state({ budgetValue: 9000, totalBudgetLabel: '18 000 FC' });
  assert.deepEqual(types.map(type => requestVehicleEstimate(type, form)), ['7 000 FC', '2 500 FC', '3 500 FC']);
  form.numberOfSeats = 1;
  assert.equal(requestVehicleEstimate('car', form), '7 000 FC', 'the server total is authoritative, no second multiplication');
  assert.equal(requestVehicleEstimate('car', state({ vehicleOptions: [quote('car', 7123.5)] })), '7 124 FC');
});

test('missing, malformed or unavailable quotes never invent a free or shared price', () => {
  for (const total of [null, undefined, 0, -500, NaN, Infinity, 0.1, '7000', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(requestVehicleEstimate('car', state({ vehicleOptions: [quote('car', total)] })), 'Indisponible');
  }
  assert.equal(requestVehicleEstimate('car', state({ vehicleOptions: [] })), 'Indisponible');
  assert.equal(requestVehicleEstimate('car', state({ vehicleOptions: [quote(types[1], 2500)] })), 'Indisponible');
  assert.equal(requestVehicleEstimate('car', state({ vehicleOptions: [quote('car', 7000, { availableForRequestedSeats: false })] })), 'Indisponible');
  assert.equal(requestVehicleEstimate(types[1], state({ numberOfSeats: 3 })), 'Indisponible');
  for (const numberOfSeats of [0, -1, NaN, Infinity, 1.5]) {
    assert.equal(requestVehicleEstimate('car', state({ numberOfSeats })), 'Indisponible');
  }
});

test('incomplete route, refresh and failed refresh do not present old prices as current estimates', () => {
  assert.equal(requestVehicleEstimate('car', state({ hasDepartureAddress: false })), 'À calculer');
  assert.equal(requestVehicleEstimate('car', state({ hasArrivalAddress: false })), 'À calculer');
  assert.equal(requestVehicleEstimate('car', state({ isPriceLoading: true })), 'Calcul…');
  assert.equal(requestVehicleEstimate('car', state({ isVehicleOptionsError: true })), 'Indisponible');
});

for (const [name, draw] of [['home', form => HomeRequestChoices({ form })], ['standard', RequestRouteStep]]) {
  for (const [scenario, perSeat] of [
    ['minimum', 2500], ['3.3 km normal route', 4950], ['5 km normal route', 7500],
    ['5 km heavy rain', 10000], ['5 km with 10 minutes of heavy traffic delay', 11200],
    ['5 km heavy rain and traffic, no double surcharge', 11200],
  ]) {
    test(`${name} displays the new ${scenario} quote for every vehicle, including unselected types`, () => {
      for (const numberOfSeats of [1, 2]) {
        const total = perSeat * numberOfSeats;
        const amount = String(total).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FC';
        const form = state({ numberOfSeats, selectedVehicleTypes: ['car'], budgetValue: 9000,
          totalBudgetLabel: '18 000 FC', vehiclePriceMultiplier: 1.3,
          vehicleOptions: [...types].reverse().map(type => quote(type, total, { recommendedPricePerSeat: perSeat })) });
        const buttons = nodes(draw(form)).filter(n => n.props.accessibilityRole === 'checkbox');
        assert.equal(buttons.length, 3);
        for (const button of buttons) {
          assert.ok(words(button).includes('Estimation' + amount));
          assert.ok(button.props.accessibilityLabel.includes('estimation pour le trajet : ' + amount));
        }
        assert.equal(form.budgetValue, 9000, 'estimates must not overwrite a manual budget');
      }
    });
  }
  test(`${name} shows all three estimates, including multiple checked types, without changing the budget`, () => {
    const form = state({ selectedVehicleTypes: [types[0], types[2]] });
    form.setSelectedVehicleTypes = update => { form.selectedVehicleTypes = update(form.selectedVehicleTypes); };
    const buttons = () => nodes(draw(form)).filter(n => n.props.accessibilityRole === 'checkbox');
    assert.equal(buttons().length, 3);
    const amounts = ['7 000 FC', '2 500 FC', '3 500 FC'];
    buttons().forEach((button, i) => {
      assert.ok(words(button).includes('Estimation' + amounts[i]));
      assert.ok(button.props.accessibilityLabel.includes('estimation pour le trajet : ' + amounts[i]));
      assert.equal(button.props.accessibilityState.checked, i !== 1);
    });
    assert.doesNotMatch(words(draw(form)), /par place|\/ place/);
    buttons()[1].props.onPress();
    assert.equal(buttons().every(button => button.props.accessibilityState.checked), true);
    assert.equal(form.budgetValue, 3500);
    form.numberOfSeats = 3;
    form.selectedVehicleTypes = ['car'];
    assert.equal(buttons()[1].props.disabled, true);
    assert.match(words(buttons()[1]), /Indisponible/);
    buttons()[0].props.onPress(); assert.deepEqual(form.selectedVehicleTypes, ['car']);
  });

  test(`${name} updates estimates without changing the user's choices or allowing stale route prices`, () => {
    const form = state({ selectedVehicleTypes: [types[0], types[2]] });
    form.isPriceLoading = true;
    assert.doesNotMatch(words(draw(form)), /7 000 FC|2 500 FC|3 500 FC/);
    assert.equal(words(draw(form)).split('Calcul…').length - 1, 3);
    form.isPriceLoading = false; form.isVehicleOptionsError = true;
    assert.equal(words(draw(form)).split('Indisponible').length - 1, 3);
    form.isVehicleOptionsError = false; form.vehicleOptions = [quote('car', 8000), quote(types[2], 4500)];
    assert.match(words(draw(form)), /8 000 FC/);
    assert.match(words(draw(form)), /4 500 FC/);
    assert.doesNotMatch(words(draw(form)), /7 000 FC|2 500 FC/);
    assert.deepEqual(form.selectedVehicleTypes, [types[0], types[2]]);
  });
}

test('per-type labels follow the existing debounced API result across route and seat changes', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const data = { options: prices() };
  let currentData = data, isFetching = false, lastArgs;
  const { useRequestVehicleOptions } = loader({ react: hooks.react,
    'react-native': { InteractionManager: { runAfterInteractions: callback => { callback(); return { cancel() {} }; } } },
    '@/store/api/tripRequestApi': { useTripRequestVehicleOptionsQuery: args => {
      lastArgs = args;
      return { data, currentData, isFetching, isError: false, refetch() {} };
    } },
  })('hooks/trip-request/useRequestVehicleOptions.ts');
  const options = { departureAddress: 'Départ test', arrivalAddress: 'Arrivée test',
    departureReference: '', arrivalReference: '', departureLocation: null, arrivalLocation: null,
    numberOfSeats: 2, hasSpecifiedNumberOfSeats: true };
  const render = () => hooks.render(() => useRequestVehicleOptions(options));
  const price = result => requestVehicleEstimate('car', state({ ...result, numberOfSeats: options.numberOfSeats }));
  assert.equal(price(render()), 'Calcul…'); assert.equal(lastArgs, skipToken);
  t.mock.timers.tick(250); assert.equal(price(render()), '7 000 FC');
  options.arrivalAddress = 'Autre arrivée';
  assert.equal(price(render()), 'Calcul…'); assert.equal(lastArgs, skipToken);
  currentData = undefined; isFetching = true;
  t.mock.timers.tick(250); assert.equal(price(render()), 'Calcul…');
  isFetching = false; currentData = { options: [quote('car', 8500)] };
  assert.equal(price(render()), '8 500 FC');
  options.numberOfSeats = 3;
  assert.equal(price(render()), 'Calcul…');
  t.mock.timers.tick(250); currentData = { options: [quote('car', 12750)] };
  assert.equal(price(render()), '12 750 FC'); assert.equal(lastArgs.numberOfSeats, 3);
});
