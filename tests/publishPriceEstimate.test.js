const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { skipToken } = require('@reduxjs/toolkit/query');
const option = (type, price, extra = {}) => ({ vehicleType: type, recommendedPricePerSeat: price,
  recommendedTotalPrice: price * 3, availableForRequestedSeats: true, ...extra });

function fixture(t) {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const state = { online: true, quote: { vehicleOptions: [option('car', 2500), option('motorcycle_2_wheels', 1200)],
    isPriceLoading: false, isVehicleOptionsError: false, retryVehicleOptions() {} } };
  const props = { enabled: true, vehicleType: 'car', price: '', hasEditedPrice: false,
    departureAddress: 'Départ fictif', arrivalAddress: 'Arrivée fictive', departureReference: '', arrivalReference: '',
    departureLocation: null, arrivalLocation: null, numberOfSeats: 3, hasSpecifiedNumberOfSeats: true };
  props.setPrice = value => { props.price = typeof value === 'function' ? value(props.price) : value; };
  props.setHasEditedPrice = value => { props.hasEditedPrice = value; };
  const load = loader({ react: hooks.react,
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: enabled => enabled && state.online },
    '@/hooks/trip-request/useRequestVehicleOptions': { useRequestVehicleOptions: options => {
      state.options = options; return state.quote;
    } },
  });
  const hook = load('hooks/publish/usePublishPriceEstimate.ts').usePublishPriceEstimate;
  return { props, state, render: () => hooks.render(() => hook(props)) };
}

test('publication suggests the server price per seat for the selected vehicle, never the total', t => {
  const f = fixture(t); assert.equal(f.render().price, '2500');
  assert.equal(f.props.price, '', 'derived advice never writes the form');
  assert.equal(f.state.options.numberOfSeats, 3);
  f.props.vehicleType = 'motorcycle_2_wheels'; assert.equal(f.render().price, '1200');
});

test('an explicit price including an empty edit survives new quotes, route, seats and vehicle changes', t => {
  const f = fixture(t); f.render().setPrice('1800');
  f.state.quote.vehicleOptions = [option('car', 6000), option('motorcycle_2_wheels', 3500)];
  f.props.arrivalAddress = 'Autre destination'; f.props.numberOfSeats = 2; f.props.vehicleType = 'motorcycle_2_wheels';
  assert.equal(f.render().price, '1800'); assert.equal(f.render().recommendation, 3500);
  f.render().setPrice(''); assert.equal(f.render().price, '');
  f.render().useEstimate(); assert.equal(f.render().price, '3500');
  f.render().setPrice(value => String(Number(value) + 500)); assert.equal(f.render().price, '4000');
});

test('pending, failed and absent quotes never auto-fill a stale price or block a manual price', t => {
  const f = fixture(t);
  for (const state of [{ isPriceLoading: true }, { isVehicleOptionsError: true }, { vehicleOptions: [] }]) {
    const original = f.state.quote; f.state.quote = { ...original, ...state };
    assert.equal(f.render().recommendation, null); assert.equal(f.render().price, '');
    f.render().useEstimate(); assert.equal(f.props.hasEditedPrice, false);
    f.render().setPrice('3100'); assert.equal(f.render().price, '3100');
    f.props.hasEditedPrice = false; f.props.price = ''; f.state.quote = original;
  }
});

test('invalid recommendations and incompatible seats require an explicit price', t => {
  const f = fixture(t);
  for (const value of [null, undefined, 0, -50, NaN, Infinity, '2500', Number.MAX_SAFE_INTEGER + 1]) {
    f.state.quote.vehicleOptions = [option('car', value)]; assert.equal(f.render().recommendation, null);
  }
  f.state.quote.vehicleOptions = [option('car', 2500, { availableForRequestedSeats: false })];
  assert.equal(f.render().price, '');
});

test('inactive, free-trip and offline reads cannot apply a quote; driver price stays intact', t => {
  const f = fixture(t); f.render().setPrice('900');
  f.props.enabled = false; assert.equal(f.render().recommendation, null); assert.equal(f.state.options.enabled, false);
  assert.equal(f.render().price, '900');
  f.props.enabled = true; f.state.online = false; assert.equal(f.render().recommendation, null);
  assert.equal(f.state.options.enabled, false);
  f.state.online = true; assert.equal(f.render().recommendation, 2500); assert.equal(f.render().price, '900');
});

test('actual cached recommendation hook debounces route changes and excludes the previous response', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  let args;
  const response = { currentData: { options: [option('car', 2500)] }, isFetching: false, isError: false, refetch() {} };
  const props = { enabled: true, vehicleType: 'car', price: '', hasEditedPrice: false,
    setPrice: value => { props.price = value; }, setHasEditedPrice: value => { props.hasEditedPrice = value; },
    departureAddress: 'Départ fictif', arrivalAddress: 'Arrivée fictive', departureReference: '', arrivalReference: '',
    departureLocation: null, arrivalLocation: null, numberOfSeats: 3, hasSpecifiedNumberOfSeats: true };
  const hook = loader({ react: hooks.react,
    'react-native': { InteractionManager: { runAfterInteractions: cb => { cb(); return { cancel() {} }; } } },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: enabled => enabled },
    '@/store/api/tripRequestApi': { useTripRequestVehicleOptionsQuery: value => { args = value; return response; } },
  })('hooks/publish/usePublishPriceEstimate.ts').usePublishPriceEstimate;
  const render = () => hooks.render(() => hook(props));
  assert.equal(render().price, ''); assert.equal(args, skipToken);
  t.mock.timers.tick(250); assert.equal(render().price, '2500');
  props.arrivalAddress = 'Nouvelle arrivée'; assert.equal(render().price, ''); assert.equal(args, skipToken);
  response.currentData = undefined; t.mock.timers.tick(250); assert.equal(render().price, '');
  render().setPrice('2200'); response.currentData = { options: [option('car', 4000)] };
  assert.equal(render().price, '2200'); assert.equal(render().recommendation, 4000);
});

test('price UI explains estimation, keeps direct editing, and offers retry or an explicit reset', () => {
  const all = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(all) : [n, ...all(n.props?.children)];
  const text = n => typeof n === 'string' || typeof n === 'number' ? String(n)
    : Array.isArray(n) ? n.map(text).join('') : text(n?.props?.children ?? '');
  const calls = [];
  const Component = loader({ 'react-native': { View: 'View', Text: 'Text', TextInput: 'Input', Switch: 'Switch',
    TouchableOpacity: 'Button', StyleSheet: { create: x => x } }, '@/utils/reanimated': { default: { View: 'Animated' } },
    './PublishSeatSelector': { PublishSeatSelector: 'Seats' }, './PublishPaymentModes': { PublishPaymentModes: 'Payment' },
    './PublishPassengerOptions': { PublishPassengerOptions: 'Options' },
  })('features/publish/PublishPricingStep.tsx').PublishPricingStep;
  const props = { price: '1800', seats: '3', setPrice: value => calls.push(value), isFreeTrip: false,
    estimate: { recommendation: 2500, loading: false, retry: () => calls.push('retry'), useEstimate: () => calls.push('reset') } };
  let tree = Component(props);
  assert.match(text(tree), /Prix estimatif.*500 FC \/ place. Modifiable/);
  all(tree).find(n => n.type === 'Input').props.onChangeText('2100');
  all(tree).find(n => n.type === 'Button').props.onPress(); assert.deepEqual(calls, ['2100', 'reset']);
  props.estimate.loading = true; tree = Component(props);
  assert.match(text(tree), /Calcul du prix estimatif/); assert.equal(all(tree).filter(n => n.type === 'Button').length, 0);
  props.estimate.loading = false; props.estimate.recommendation = null; tree = Component(props);
  assert.match(text(tree), /Estimation indisponible/);
  assert.equal(all(tree).find(n => n.type === 'Input').props.editable, true);
  all(tree).find(n => n.type === 'Button').props.onPress(); assert.equal(calls.at(-1), 'retry');
  props.isFreeTrip = true; assert.doesNotMatch(text(Component(props)), /estimat/i);
});

test('publish another resets the manual-price flag along with the existing draft', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const load = loader({ react: hooks.react, 'react-native': { Platform: { OS: 'android' } } });
  const useForm = load('hooks/publish/usePublishFormState.ts').usePublishFormState;
  const useSuccess = load('hooks/publish/usePublishSuccessActions.ts').usePublishSuccessActions;
  const render = () => hooks.render(() => {
    const form = useForm('car');
    const actions = useSuccess({ form, departureAutoFillStartedRef: { current: true }, departureTouchedRef: { current: true },
      publicationSuccessActionRef: { current: false }, publicationSuccess: { recurring: false }, setPublicationSuccess() {},
      setStep() {}, vehicle: new Proxy({}, { get: () => () => {} }), router: {} });
    return { form, actions };
  });
  render().form.setPrice('3333'); render().form.setHasEditedPrice(true);
  assert.equal(render().form.hasEditedPrice, true);
  render().actions.finishPublicationSuccess('another'); t.mock.timers.tick(80);
  assert.equal(render().form.price, ''); assert.equal(render().form.hasEditedPrice, false);
});
