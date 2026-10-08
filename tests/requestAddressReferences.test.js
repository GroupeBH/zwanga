const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const load = loader({
  'react-native': { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', ScrollView: 'Scroll',
    ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
  '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/utils/reanimated': { __esModule: true, default: { View: 'AnimatedView' }, FadeIn: {} },
  'react-native-maps': { __esModule: true, default: 'Map', Marker: 'Marker', Polyline: 'Line', PROVIDER_GOOGLE: 'google' },
  '@/assets/images/map-markers/trip-detail-marker-departure.png': 1,
  '@/assets/images/map-markers/trip-detail-marker-arrival.png': 2,
});
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement(tree)) return [];
  return [tree, ...nodes(tree.props.children)];
}
function words(tree) {
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(words).join('');
  return React.isValidElement(tree) ? words(tree.props.children) : '';
}

test('departure and arrival have separate, labelled optional inputs in both map and manual mode', () => {
  const { RequestRouteStep } = load('components/trip-request/RequestRouteStep.tsx');
  for (const addressInputMode of ['map', 'manual']) {
    const changes = [];
    const tree = RequestRouteStep({ addressInputMode, addressSectionStep: 'departure',
      favoriteSuggestions: [], showQuickLandmarks: false, departureReference: 'Pharmacie', arrivalReference: 'Portail bleu',
      departureAddress: 'Départ test', arrivalAddress: 'Arrivée test', hasDepartureAddress: true, hasArrivalAddress: true,
      departureManualAddress: '', departureTouchedRef: { current: false },
      setDepartureReference: value => changes.push(['departure', value]), setArrivalReference: value => changes.push(['arrival', value]),
    });
    const inputs = nodes(tree).filter(n => n.type === 'Input' && n.props.accessibilityLabel?.startsWith('Repère'));
    assert.equal(inputs.length, 2);
    assert.equal(inputs[0].props.value, 'Pharmacie'); assert.equal(inputs[1].props.value, 'Portail bleu');
    for (const input of inputs) {
      assert.match(input.props.accessibilityLabel, /facultatif/);
      assert.equal(input.props.maxLength, 200);
      assert.ok(input.props.style.minHeight >= 44);
    }
    inputs[0].props.onChangeText('Entrée principale'); inputs[1].props.onChangeText('Devant le marché');
    assert.deepEqual(changes, [['departure', 'Entrée principale'], ['arrival', 'Devant le marché']]);
    assert.match(words(tree), /Repère au départ · facultatif/);
    assert.match(words(tree), /Repère à l’arrivée · facultatif/);
  }
});

test('route preview includes nonempty landmarks without replacing addresses or adding empty labels', () => {
  const { RequestRoutePreview } = load('components/trip-request/RequestRoutePreview.tsx');
  const props = { departureAddress: 'Départ test', arrivalAddress: 'Arrivée test', departureReference: '  Pharmacie  ',
    arrivalReference: 'Portail bleu', routeCoordinates: [], setRequestFormStep() {} };
  const preview = RequestRoutePreview.type(props);
  assert.match(words(preview), /Départ testRepère : Pharmacie/);
  assert.match(words(preview), /Arrivée testRepère : Portail bleu/);
  assert.equal(nodes(preview).filter(n => n.type === 'Map').length, 1);
  assert.doesNotMatch(words(RequestRoutePreview.type({ ...props, departureReference: '  ', arrivalReference: '' })), /Repère/);
});

test('controller exposes landmarks, preserves them across steps and swaps them with their addresses', () => {
  const hooks = hookHarness();
  const draft = { departureReference: 'Pharmacie', arrivalReference: 'Portail bleu',
    departureManualAddress: 'Départ test', arrivalManualAddress: 'Arrivée test',
    departureLocation: { latitude: -4.32, longitude: 15.3 }, arrivalLocation: { latitude: -4.35, longitude: 15.35 } };
  for (const name of ['DepartureReference', 'ArrivalReference', 'DepartureManualAddress', 'ArrivalManualAddress', 'DepartureLocation', 'ArrivalLocation']) {
    const key = name[0].toLowerCase() + name.slice(1);
    draft[`set${name}`] = value => { draft[key] = value; };
  }
  let submission;
  const { useRequestTripController } = loader({ react: { ...hooks.react, startTransition: fn => fn() },
    './useRequestDraft': { useRequestDraft: () => ({ ...draft }) },
    './useRequestSchedule': { useRequestSchedule: () => ({}) },
    './useRequestSubmission': { useRequestSubmission: props => { submission = props; return {}; } },
    './useRequestRouteEffects': { useRequestRouteEffects: () => ({}) },
    './useRequestQuickPlaces': { useRequestQuickPlaces: () => ({}) },
    './useRequestBudgetSummary': { useRequestBudgetSummary: () => ({ hasDepartureAddress: true, hasArrivalAddress: true }) },
    './useRequestRoutePrefill': { useRequestRoutePrefill: () => ({}) },
    '@/hooks/useUserLocation': { useUserLocation: () => ({}) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/api/googleMapsApi': { useGeocodeMutation: () => [() => {}] },
    '@/store/api/userApi': { useGetFavoriteLocationsQuery: () => ({}) },
    'expo-router': { useLocalSearchParams: () => ({}), useRouter: () => ({}) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({}) },
  })('hooks/trip-request/useRequestTripController.ts');
  const render = () => hooks.render(useRequestTripController);
  let view = render();
  view.setDepartureReference('Devant la pharmacie'); view.setArrivalReference('Portail vert');
  render().setRequestFormStep('details');
  assert.equal(render().departureReference, 'Devant la pharmacie');
  render().setRequestFormStep('route');
  render().swapRoutePoints();
  view = render();
  assert.equal(view.departureReference, 'Portail vert'); assert.equal(view.arrivalReference, 'Devant la pharmacie');
  assert.equal(view.departureManualAddress, 'Arrivée test'); assert.equal(view.arrivalManualAddress, 'Départ test');
  assert.deepEqual(view.departureLocation, { latitude: -4.35, longitude: 15.35 });
  assert.equal(submission.departureReference, 'Portail vert'); assert.equal(submission.arrivalReference, 'Devant la pharmacie');
  hooks.unmount();
});
