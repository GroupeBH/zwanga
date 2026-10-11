const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
const words = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(words).join('')
  : React.isValidElement(tree) ? words(tree.props.children) : '';
function fixture({ enabled = true, granted = false, role = 'driver', available = true, initialError = false } = {}) {
  const hooks = hookHarness(), calls = [];
  let user = { id: 'driver', role }, version = 0, delay, result = true;
  const component = loader({
    react: hooks.react,
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
      AppState: { currentState: 'active' }, StyleSheet: { create: value => value } },
    '@/store/hooks': { useAppSelector: selector => selector({ auth: { user } }) },
    '@/store/selectors': { selectUser: state => state.auth.user },
    '@/utils/accountRole': { isDriverAccount: value => value?.role === 'driver' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
    'expo-location': {
      getForegroundPermissionsAsync: async () => ({ granted: true }),
      getBackgroundPermissionsAsync: async () => {
        if (initialError) { initialError = false; throw new Error('temporary native error'); }
        return { granted };
      },
      requestForegroundPermissionsAsync: async () => { calls.push('foreground'); return { granted: true }; },
      requestBackgroundPermissionsAsync: async () => {
        calls.push('permission'); if (delay) await delay; granted = result; return { granted };
      },
    },
    '@/services/nearbyDriverLocation': {
      isNearbyDriverLocationEnabled: async () => enabled,
      setNearbyDriverLocationEnabled: async (_id, value) => { calls.push(value ? 'enable' : 'disable'); enabled = value; },
      ensureNearbyDriverLocation: async () => { calls.push('start'); return true; },
    },
  })('components/profile/NearbyDriverLocationPermission.tsx').NearbyDriverLocationPermission;
  return { hooks, calls, render: () => hooks.render(() => component({ available })),
    delay: value => { delay = value; }, deny: () => { result = false; },
    switchAccount: () => { version++; user = { id: 'next', role }; },
  };
}

test('settings disclose background location and require an explicit tap before any OS prompt', async () => {
  const f = fixture(); f.render(); await tick(); const tree = f.render();
  assert.match(words(tree), /même en arrière-plan/); assert.deepEqual(f.calls, []);
  nodes(tree).find(node => node.type === 'Button').props.onPress(); await tick();
  assert.deepEqual(f.calls, ['permission', 'enable', 'start']);
  assert.match(words(f.render()), /Suivi automatique autorisé/); f.hooks.unmount();
});

test('a transient initial permission error offers an enabled retry and recovers without leaving the screen', async () => {
  const f = fixture({ initialError: true, granted: true }); f.render(); await tick();
  let tree = f.render();
  assert.match(words(tree), /Impossible de vérifier les autorisations/);
  assert.doesNotMatch(words(tree), /Vérification des autorisations…/);
  const button = nodes(tree).find(node => node.type === 'Button' && words(node) === 'Réessayer');
  assert.notEqual(button.props.disabled, true); button.props.onPress();
  f.render(); await tick(); tree = f.render();
  assert.match(words(tree), /Suivi automatique autorisé/); assert.deepEqual(f.calls, []);
  f.hooks.unmount();
});

test('already granted OS permission shows default automatic mode without another activation button', async () => {
  const f = fixture({ granted: true }); f.render(); await tick();
  assert.deepEqual(f.calls, []);
  assert.match(words(f.render()), /Suivi automatique autorisé, sans activation supplémentaire/);
  const button = nodes(f.render()).find(node => node.type === 'Button');
  assert.match(words(button), /Désactiver/); button.props.onPress(); await tick();
  assert.deepEqual(f.calls, ['disable']); f.hooks.unmount();
});

test('denied permission leaves foreground discovery available without saving consent', async () => {
  const f = fixture(); f.deny(); f.render(); await tick();
  nodes(f.render()).find(node => node.type === 'Button').props.onPress(); await tick();
  assert.deepEqual(f.calls, ['permission']); assert.match(words(f.render()), /commandes restent accessibles/);
  f.hooks.unmount();
});

test('passengers cannot enable driver GPS; a disabled server still allows revocation', async () => {
  const passenger = fixture({ role: 'passenger' }); assert.equal(passenger.render(), null); passenger.hooks.unmount();
  const f = fixture({ granted: true, available: false }); f.render(); await tick();
  const button = nodes(f.render()).find(node => node.type === 'Button');
  assert.equal(button.props.disabled, false); button.props.onPress(); await tick();
  assert.deepEqual(f.calls, ['disable']); f.hooks.unmount();
});

test('a disabled account can explicitly re-enable when OS permission is already granted', async () => {
  const f = fixture({ enabled: false, granted: true }); f.render(); await tick();
  assert.match(words(f.render()), /Votre choix reste mémorisé/);
  nodes(f.render()).find(node => node.type === 'Button').props.onPress(); await tick();
  assert.deepEqual(f.calls, ['enable', 'start']); f.hooks.unmount();
});

test('an opt-out is possible even without system permission and never opens a permission prompt', async () => {
  const f = fixture(); f.render(); await tick();
  nodes(f.render()).find(node => node.type === 'Button' && /Désactiver le suivi automatique/.test(words(node)))
    .props.onPress(); await tick();
  assert.deepEqual(f.calls, ['disable']); f.hooks.unmount();
});

test('double taps and an account change during permission cannot start old-account tracking', async () => {
  const f = fixture(); let resolve; f.delay(new Promise(done => { resolve = done; }));
  f.render(); await tick(); const button = nodes(f.render()).find(node => node.type === 'Button');
  button.props.onPress(); button.props.onPress(); await tick();
  assert.deepEqual(f.calls, ['permission']);
  f.switchAccount(); f.render(); resolve(); await tick();
  assert.deepEqual(f.calls, ['permission']); f.hooks.unmount();
});
