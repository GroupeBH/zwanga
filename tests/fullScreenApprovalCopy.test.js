const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes)
  : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join(' ')
  : React.isValidElement(tree) ? text(tree.props.children) : '';
function fixture(version) {
  return loader({
    'react-native': { ActivityIndicator: 'Spinner', Platform: { OS: 'android', Version: version },
      View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll', StyleSheet: { create: v => v } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'Safe' },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
  })('components/permissions/DriverFullScreenApproval.tsx').DriverFullScreenApproval;
}
test('concise modal names the actual next system destination, without automatic settings navigation', () => {
  for (const [version, props, label] of [
    [34, { notificationsAllowed: false }, 'Ouvrir les notifications'],
    [34, { allowed: false }, 'Ouvrir les réglages'],
    [34, { allowed: true }, 'Activer'],
    [33, { allowed: false }, 'Activer'],
    [34, { error: true }, 'Réessayer'],
  ]) {
    const calls = [], render = fixture(version);
    const tree = render({ visible: true, busy: false, error: false,
      onConfirm: () => calls.push('confirm'), onClose: () => calls.push('later'), ...props });
    const buttons = nodes(tree).filter(n => n.type === 'Button');
    assert.equal(text(buttons[0]).trim(), label); assert.equal(text(buttons[1]).trim(), 'Plus tard');
    assert.ok(text(tree).split(/\s+/).length < 60); assert.match(text(tree), /Facultatif/);
    assert.match(text(tree), /téléphone reste verrouillé/); assert.deepEqual(calls, []);
    buttons[0].props.onPress(); buttons[1].props.onPress(); assert.deepEqual(calls, ['confirm', 'later']);
  }
});
