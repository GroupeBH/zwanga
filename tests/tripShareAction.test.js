/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('share is prominent, accessible and coalesces taps until the native share finishes', async () => {
  const hooks = hookHarness(); let calls = 0, finish;
  const { TripShareAction } = loader({ react: hooks.react, '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
      StyleSheet: { create: value => value } },
  })('components/trip/TripShareAction.tsx');
  const render = () => hooks.render(() => TripShareAction({ onShare: () => {
    calls++; return new Promise(resolve => { finish = resolve; });
  } }));
  const tree = render(); assert.equal(tree.props.accessibilityLabel, 'Partager mon trajet');
  tree.props.onPress(); tree.props.onPress();
  assert.equal(calls, 1); assert.equal(render().props.disabled, true);
  finish(); await tick(); assert.equal(render().props.disabled, false);
  hooks.unmount();
});

test('trip routes no longer mount the contacts/security modals and retain emergency actions', () => {
  const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  assert.doesNotMatch(read('app/trip/[id].tsx'), /TripRelativesModal/);
  assert.doesNotMatch(read('app/trip/navigate/[id].tsx'), /NavigationSecurityModal/);
  assert.doesNotMatch(read('app/trip/manage/[id].tsx'), /TripSecurityPanel/);
  assert.doesNotMatch(read('app/security.tsx'), /TextInput|useAddEmergencyContact|<Modal/);
  assert.ok(read('features/passenger-navigation/PassengerNavigationHeader.tsx').includes('onSos={assistance.openSos}'));
  assert.ok(read('features/driver-navigation/DriverNavigationTopPanel.tsx').includes('onSos={assistance.openSos}'));
});
