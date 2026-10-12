const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { RideActionResultNotice } = loader({ 'react-native': { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button',
  StyleSheet: { create: value => value } }, '@expo/vector-icons': { Ionicons: 'Icon' },
})('features/ride-recovery/RideActionResultNotice.tsx');
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const result = { id: 'r', userId: 'passenger', tripId: 'trip', bookingId: 'booking', stage: 'dropoff', actor: 'passenger',
  receipt: { eventId: 'event', state: 'queued', decision: 'confirm' } };

test('pickup and dropoff never open a result modal; normal progress remains in existing stage controls', () => {
  for (const actor of ['driver', 'passenger']) for (const stage of ['pickup', 'dropoff'])
    for (const state of ['queued', 'sending', 'received', 'confirmed']) {
      assert.equal(RideActionResultNotice({ result: { ...result, actor, stage, receipt: { ...result.receipt, state } }, onClose() {} }), null);
    }
});

test('errors are readable, bounded, non-modal and closable without another declaration', () => {
  let closed = 0;
  for (const failure of [{ error: 'Impossible d’enregistrer.' }, { receipt: { ...result.receipt, state: 'blocked' } },
    { receipt: { ...result.receipt, state: 'disputed' } }]) {
    const tree = RideActionResultNotice({ result: { ...result, ...failure }, onClose: () => closed++ });
    assert.equal(tree.type, 'Scroll'); assert.equal(tree.props.style.maxHeight, 110);
    assert.equal(all(tree).some(node => /Modal/.test(String(node.type))), false);
    assert.ok(all(tree).some(node => node.props?.accessibilityLiveRegion === 'polite'));
    const button = all(tree).find(node => node.type === 'Button');
    assert.equal(button.props.accessibilityRole, 'button'); assert.ok(button.props.style.minHeight >= 44);
    button.props.onPress();
  }
  assert.equal(closed, 3);
});
