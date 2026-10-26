const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes)
  : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const words = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(words).join('')
  : React.isValidElement(tree) ? words(tree.props.children) : '';

function fixture(os = 'android', version = 35) {
  const calls = [];
  const { BackgroundLocationApproval } = loader({
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button',
      ActivityIndicator: 'Spinner', Platform: { OS: os, Version: version }, StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaView: 'Safe' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
  })('components/location/BackgroundLocationApproval.tsx');
  const props = { visible: true, busy: false, loaded: true, loadError: false, permission: false,
    foregroundPermission: true, settingsRequired: false, message: '',
    onConfirm: () => calls.push('confirm'), onClose: () => calls.push('close') };
  return { calls, render: patch => BackgroundLocationApproval({ ...props, ...patch }) };
}

test('approval opens inside the app, discloses background use, and is scrollable with a single confirmation', () => {
  const f = fixture(), tree = f.render();
  assert.equal(tree.type, 'Modal'); assert.equal(tree.props.inApp, true); assert.equal(tree.props.visible, true);
  assert.ok(nodes(tree).some(n => n.type === 'Scroll'));
  assert.deepEqual(nodes(tree).find(n => n.type === 'Safe').props.edges, ['bottom', 'left', 'right']);
  assert.match(words(tree), /écran éteint/); assert.match(words(tree), /au serveur/);
  assert.match(words(tree), /3 minutes/); assert.match(words(tree), /dans une autre application/);
  assert.match(words(tree), /Android peut ouvrir/); assert.match(words(tree), /Toujours autoriser/);
  const buttons = nodes(tree).filter(n => n.type === 'Button');
  assert.deepEqual(buttons.map(words), ['Autoriser', 'Plus tard']);
  assert.equal(nodes(tree).some(n => n.props.accessibilityRole === 'checkbox'), false);
  assert.deepEqual(f.calls, []); buttons[0].props.onPress(); assert.deepEqual(f.calls, ['confirm']);
});

test('foreground access is explained before background; Android 10 and iOS still describe native prompts', () => {
  const a = fixture(); assert.match(words(a.render({ foregroundPermission: false })), /d’abord la position/);
  assert.doesNotMatch(words(a.render({ foregroundPermission: false })), /impose ce dernier réglage/);
  const old = fixture('android', 29);
  assert.match(words(old.render()), /Dans la fenêtre du téléphone/);
  assert.doesNotMatch(words(old.render()), /Android peut ouvrir/);
  const ios = fixture('ios');
  assert.match(words(ios.render()), /« Toujours »/); assert.doesNotMatch(words(ios.render()), /Android/);
  assert.match(words(ios.render()), /plus tard, même après avoir quitté Zwanga/);
});

test('a blocked system grant shows exact steps and requires a distinct settings action, never auto-navigation', () => {
  for (const os of ['android', 'ios']) {
    const f = fixture(os), tree = f.render({ settingsRequired: true });
    assert.match(words(tree), /Le téléphone impose ce dernier réglage/);
    assert.match(words(tree), /Position/); assert.match(words(tree), /Revenez dans Zwanga/);
    assert.match(words(tree), os === 'ios' ? /« Toujours »/ : /« Toujours autoriser »/);
    assert.equal(words(nodes(tree).find(n => n.type === 'Button')), 'Ouvrir les autorisations');
    assert.deepEqual(f.calls, []);
  }
});

test('busy approval blocks repeated submissions but always permits Later and Android back', () => {
  const f = fixture(), busy = f.render({ busy: true });
  const buttons = nodes(busy).filter(n => n.type === 'Button');
  assert.equal(buttons[0].props.disabled, true); assert.notEqual(buttons[1].props.disabled, true);
  busy.props.onRequestClose(); assert.deepEqual(f.calls, ['close']); f.calls.length = 0;
  const idle = f.render(); idle.props.onRequestClose(); assert.deepEqual(f.calls, ['close']);
  nodes(idle).filter(n => n.type === 'Button')[1].props.onPress(); assert.deepEqual(f.calls, ['close', 'close']);
});

test('a failed permission read provides retry, and a granted OS permission explains only local reactivation', () => {
  const f = fixture(), error = f.render({ loaded: false, loadError: true });
  assert.match(words(error), /Impossible de vérifier/);
  const retry = nodes(error).find(n => n.type === 'Button');
  assert.equal(words(retry), 'Réessayer'); assert.equal(retry.props.disabled, false);
  assert.match(words(f.render({ permission: true })), /déjà donné son accord/);
  assert.doesNotMatch(words(f.render({ permission: true })), /Android peut ouvrir/);
  assert.match(words(f.render({ message: 'Position non autorisée.' })), /Position non autorisée/);
});
