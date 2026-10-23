const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const all = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(all) : [n, ...all(n.props?.children)];
const words = n => typeof n === 'string' ? n : Array.isArray(n) ? n.map(words).join('') : words(n?.props?.children ?? '');

test('manual boarding and dropoff show non-blocking, dismissible toasts for both roles', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const actor of ['driver', 'passenger']) for (const stage of ['pickup', 'dropoff']) {
    const h = hookHarness(); let closed = 0;
    const { RideActionResultToast } = loader({ react: { ...React, ...h.react },
      'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 30 }) }, '@expo/vector-icons': { Ionicons: 'Icon' },
    })('features/ride-recovery/RideActionResultToast.tsx');
    const props = { result: { id: 'result', userId: actor, actor, stage, bookingId: 'b', tripId: 't',
      receipt: { eventId: 'event', state: 'queued', decision: 'confirm' } }, onClose: () => { closed++; } };
    const render = () => h.render(() => RideActionResultToast(props));
    const tree = render();
    assert.equal(tree.type, 'View'); assert.equal(tree.props.pointerEvents, 'box-none');
    assert.match(words(tree), /sauvegardée sur ce téléphone/);
    assert.equal(all(tree).filter(n => n.type === 'Button').length, 1, 'only optional dismiss, no Compris/Continuer');
    t.mock.timers.tick(4999); assert.equal(closed, 0);
    props.entry = { eventId: 'event', actorUserId: actor, bookingId: 'b', tripId: 't', stage, state: 'confirmed', decision: 'confirm' };
    assert.match(words(render()), /confirmé/); t.mock.timers.tick(5000); assert.equal(closed, 1);
    props.entry.state = 'blocked'; assert.match(words(render()), /non validée/);
    t.mock.timers.tick(7999); assert.equal(closed, 1);
    t.mock.timers.tick(1); assert.equal(closed, 2);
    props.result = { ...props.result, id: 'other', error: 'Impossible d’enregistrer.' };
    assert.match(words(render()), /non enregistrée/); h.unmount();
    t.mock.timers.tick(20000); assert.equal(closed, 2, 'unmount releases timer');
  }
});
