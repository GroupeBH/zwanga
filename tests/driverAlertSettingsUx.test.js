const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const nodes = x => Array.isArray(x) ? x.flatMap(nodes) : React.isValidElement(x) ? [x, ...nodes(x.props.children)] : [];
const words = x => typeof x === 'string' ? x : Array.isArray(x) ? x.map(words).join(' ') : React.isValidElement(x) ? words(x.props.children) : '';

function fixture() {
  const hooks = hookHarness(), calls = [];
  const state = { active: true, online: true, available: true, error: false, fetching: false, history: false, failSettings: false };
  const Screen = loader({ react: hooks.react,
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    'expo-router': { useRouter: () => ({ canGoBack: () => state.history, back: () => calls.push('back'), replace: x => calls.push(x) }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/store/hooks': { useAppSelector: fn => fn({ zwangaApi: { config: { online: state.online } } }) },
    '@/store/api/driverDispatchApi': { useDriverDispatchStatusQuery: (_, options) => { state.query = options; return {
      data: { enabled: true, automatic: true, available: state.available }, isError: state.error, isFetching: state.fetching,
      refetch: () => calls.push('retry'),
    }; } },
    '@/components/profile/NearbyDriverLocationPermission': { NearbyDriverLocationPermission: 'Location' },
    '@/components/profile/DriverFullScreenPreference': { DriverFullScreenPreference: 'Fullscreen' },
    '@/services/driverAlertChannel': { openDriverAlertSettings: async () => { calls.push('settings'); if (state.failSettings) throw Error('fixture'); } },
  })('app/driver-availability.tsx').default;
  return { state, calls, hooks, render: () => hooks.render(Screen) };
}
test('settings explain location, fold secondary text and safely leave a cold-opened route', () => {
  const f = fixture(), tree = f.render();
  assert.match(words(tree), /Localisation et alertes/);
  assert.doesNotMatch(words(tree), /Aucune disponibilité à activer|mode silencieux/);
  assert.equal(nodes(tree).find(n => n.type === 'Location').props.available, true);
  f.state.available = false;
  assert.match(words(f.render()), /Réception à vérifier/);
  assert.doesNotMatch(words(f.render()), /Automatique selon/);
  nodes(tree).find(n => n.props.accessibilityState?.expanded === false).props.onPress();
  assert.match(words(f.render()), /mode silencieux/);
  nodes(tree).find(n => n.props.accessibilityLabel === 'Retour').props.onPress();
  f.state.history = true;
  nodes(f.render()).find(n => n.props.accessibilityLabel === 'Retour').props.onPress();
  assert.deepEqual(f.calls, ['/(tabs)', 'back']);
  f.hooks.unmount();
});
test('error/retry is actionable, while offline or blurred screens cannot claim availability or retry', () => {
  const f = fixture(); f.state.error = true;
  const retry = () => nodes(f.render()).find(n => n.type === 'Button' && words(n) === 'Réessayer');
  retry().props.onPress(); assert.deepEqual(f.calls, ['retry']);
  f.state.online = false;
  const tree = f.render();
  assert.match(words(tree), /Connexion nécessaire/);
  assert.equal(nodes(tree).find(n => n.type === 'Location').props.available, false);
  assert.equal(retry().props.disabled, true); retry().props.onPress();
  f.state.online = true; f.state.active = false;
  retry().props.onPress(); assert.equal(f.state.query.skip, true);
  assert.deepEqual(f.calls, ['retry']); f.hooks.unmount();
});
test('OS notification settings remain explicit and failures are visible rather than swallowed', async () => {
  const f = fixture(); f.state.failSettings = true;
  const button = () => nodes(f.render()).find(n => n.props.accessibilityLabel === 'Régler le son et les notifications');
  assert.deepEqual(f.calls, []); button().props.onPress(); await tick();
  assert.match(words(f.render()), /Impossible d’ouvrir les réglages/);
  f.state.failSettings = false; button().props.onPress(); await tick();
  assert.doesNotMatch(words(f.render()), /Impossible d’ouvrir les réglages/);
  f.state.active = false; button().props.onPress(); await tick();
  assert.deepEqual(f.calls, ['settings', 'settings']); f.hooks.unmount();
});
