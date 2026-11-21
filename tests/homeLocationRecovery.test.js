const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { nativeAppState } = require('./helpers/nativeAppState.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes)
  : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];

test('Home location button recovers real GPS access before recentering, for both passenger and driver', async () => {
  const hooks = hookHarness(), app = nativeAppState(), calls = [], env = { services: false, active: true };
  const { HomeLocationButton } = loader({ react: { ...React, ...hooks.react },
    'react-native': { AppState: app, Platform: { OS: 'android', select: value => value.android },
      View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x },
      Linking: { sendIntent: async action => calls.push(action), openSettings: async () => calls.push('settings') } },
    'expo-location': { getForegroundPermissionsAsync: async () => ({ granted: true }), hasServicesEnabledAsync: async () => env.services },
    '@expo/vector-icons': { Ionicons: 'Icon' },
  })('components/home/HomeLocationButton.tsx');
  const render = () => hooks.render(() => HomeLocationButton.type({ active: env.active, locationButtonBottom: 200,
    handleReturnToUserLocation: () => calls.push('center'), isCenteringOnUser: false }));
  const button = () => nodes(render()).find(node => node.type === 'Button');
  render(); assert.deepEqual(calls, []);
  button().props.onPress(); await tick();
  assert.deepEqual(calls, [], 'explain the missing GPS before opening Settings');
  const recovery = nodes(render()).find(node => node.type.name === 'LocationRecoveryAction');
  assert.ok(recovery);
  await recovery.props.recovery.recover();
  assert.deepEqual(calls, ['android.settings.LOCATION_SOURCE_SETTINGS']);
  env.services = true; app.emit('blur'); app.emit('focus'); render(); await tick();
  assert.deepEqual(calls, ['android.settings.LOCATION_SOURCE_SETTINGS', 'center']);
  assert.equal(nodes(render()).some(node => node.type.name === 'LocationRecoveryAction'), false);
  env.active = false; assert.equal(button().props.disabled, true);
  button().props.onPress(); await tick(); assert.equal(calls.length, 2);
  hooks.unmount(); assert.equal(app.count(), 0);
});
