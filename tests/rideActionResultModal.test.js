const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(words).join('') : words(node?.props?.children ?? '');
function fixture(reduced = false) {
  const hooks = hookHarness(); let closed = 0, animations = 0, removed = 0, listener;
  const native = { View: 'View', ScrollView: 'Scroll', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x },
    Animated: { View: 'AnimatedView', Value: class { interpolate(x) { return x; } stopAnimation() {} setValue() {} }, timing: () => ({ start() { animations++; } }) },
    AccessibilityInfo: { addEventListener: (_name, fn) => { listener = fn; return { remove() { removed++; } }; }, isReduceMotionEnabled: async () => reduced } };
  const { RideActionResultModal } = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' }, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
  })('features/ride-recovery/RideActionResultModal.tsx');
  const props = { result: { id: 'r', userId: 'passenger', tripId: 'trip', bookingId: 'booking', stage: 'dropoff', actor: 'passenger', numberOfSeats: 3,
    receipt: { eventId: 'event', state: 'queued', decision: 'confirm' } }, onClose: () => closed++ };
  return { hooks, props, render: () => hooks.render(() => RideActionResultModal(props)), closed: () => closed,
    animations: () => animations, removed: () => removed, reduce: value => listener(value) };
}

test('one accessible result modal shows group context, scrollable copy and a fixed close-only action', () => {
  const h = fixture(), tree = h.render();
  assert.equal(tree.type, 'Modal'); assert.equal(tree.props.inApp, true); assert.equal(tree.props.priority, 75);
  assert.equal(all(tree).filter(node => node.type === 'Modal').length, 1);
  assert.match(words(tree), /Dépose.*Confirmation enregistrée.*Votre réservation · 3 places/);
  assert.equal(all(tree).find(node => node.type === 'Text' && node.props.accessibilityRole === 'header').props.children, 'Confirmation enregistrée');
  const scroll = all(tree).find(node => node.type === 'Scroll');
  const buttons = all(tree).filter(node => node.type === 'Button');
  assert.equal(buttons.length, 2, 'close icon and one main action');
  assert.equal(all(scroll).filter(node => node.type === 'Button').length, 0);
  assert.ok(buttons[1].props.style[0].minHeight >= 44);
  assert.deepEqual(all(tree).find(node => node.type === 'SafeArea').props.edges, ['top', 'bottom', 'left', 'right']);
  buttons[1].props.onPress(); tree.props.onRequestClose(); buttons[0].props.onPress();
  assert.equal(h.closed(), 3, 'buttons only dismiss; no retry, navigation or mutation callback is passed');
  h.hooks.unmount();
});

test('the same modal updates from sending to success or failure without a duplicate payment claim', () => {
  const h = fixture();
  for (const state of ['sending', 'received', 'confirmed', 'blocked', 'disputed']) {
    h.props.entry = { eventId: 'event', actorUserId: 'passenger', bookingId: 'booking', tripId: 'trip', stage: 'dropoff', state, decision: 'confirm' };
    const tree = h.render();
    assert.equal(tree.type, 'Modal'); assert.equal(all(tree).filter(node => node.type === 'Modal').length, 1);
    assert.equal(all(tree).filter(node => node.type === 'Spinner').length, state === 'sending' ? 1 : 0);
    if (state === 'confirmed') { assert.match(words(tree), /Dépose confirmée/); assert.doesNotMatch(words(tree), /Paiement confirmé|trajet payé/i); }
    if (state === 'blocked') assert.match(words(tree), /Confirmation non validée.*Revenir au trajet/);
  }
  h.hooks.unmount();
});

test('motion respects reduced-motion preference and tears down listeners/late callbacks', async () => {
  const reduced = fixture(true); reduced.render(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(reduced.animations(), 0); reduced.hooks.unmount(); assert.equal(reduced.removed(), 1);
  const moving = fixture(); moving.render(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(moving.animations(), 1); moving.reduce(true); assert.equal(moving.animations(), 1);
  moving.hooks.unmount(); assert.equal(moving.removed(), 1);
  const late = fixture(); late.render(); late.hooks.unmount(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(late.animations(), 0);
});
