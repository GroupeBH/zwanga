const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, { reduced = false, fail = false, delayed = false } = {}) {
  const hooks = hookHarness(), calls = [], timings = [];
  let enabled = true, listener, resolve;
  const preference = delayed ? new Promise(done => { resolve = done; })
    : fail ? Promise.reject(Error('preference unavailable')) : Promise.resolve(reduced);
  const { useRequestPickupRipple } = loader({ react: hooks.react, 'react-native': {
    Easing: { linear: 'linear' },
    AccessibilityInfo: {
      addEventListener: (event, callback) => {
        assert.equal(event, 'reduceMotionChanged'); listener = callback;
        return { remove: () => calls.push('unsubscribe') };
      }, isReduceMotionEnabled: () => preference,
    },
    Animated: {
      Value: class { setValue(value) { calls.push(['value', value]); } stopAnimation() { calls.push('stopValue'); } },
      timing: (_value, config) => { timings.push(config); return config; },
      loop: () => ({ start: () => calls.push('start'), stop: () => calls.push('stop') }),
    },
  } })('hooks/request-detail/useRequestPickupRipple.ts');
  t.after(() => hooks.unmount());
  return { calls, timings, hooks, render: () => hooks.render(() => useRequestPickupRipple(enabled)),
    enable: value => { enabled = value; }, change: value => listener(value), resolve: value => resolve(value) };
}

test('two pickup waves share one slow native timeline which stops when disabled or unmounted', async t => {
  const f = fixture(t); const progress = f.render(); await tick();
  assert.equal(f.calls.filter(x => x === 'start').length, 1);
  assert.deepEqual(f.timings, [{ toValue: 1, duration: 2400, easing: 'linear', useNativeDriver: true, isInteraction: false }]);
  assert.equal(f.render(), progress); assert.equal(f.calls.filter(x => x === 'start').length, 1);
  f.enable(false); f.render(); assert.ok(f.calls.includes('stop')); assert.ok(f.calls.includes('unsubscribe'));
  f.change(false); assert.equal(f.calls.filter(x => x === 'start').length, 1, 'obsolete listener cannot restart');
  f.enable(true); f.render(); await tick(); assert.equal(f.calls.filter(x => x === 'start').length, 2);
  f.hooks.unmount(); assert.equal(f.calls.filter(x => x === 'unsubscribe').length, 2);
});

test('reduced motion, unreadable preferences and late replies leave the pickup static', async t => {
  for (const options of [{ reduced: true }, { fail: true }]) {
    const f = fixture(t, options); f.render(); await tick(); assert.equal(f.calls.includes('start'), false);
  }
  const f = fixture(t, { delayed: true }); f.render(); f.change(true); f.resolve(false); await tick();
  assert.equal(f.calls.includes('start'), false); f.change(false); assert.ok(f.calls.includes('start'));
  f.change(true); assert.ok(f.calls.includes('stop'));
  const g = fixture(t, { delayed: true }); g.render(); g.hooks.unmount(); g.resolve(false); await tick();
  assert.equal(g.calls.includes('start'), false);
});

const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree)
  ? [tree, ...nodes(tree.props.children)] : [];
test('waves expand and fade around the same icon without capturing map gestures', t => {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const offsets = [], enabled = [];
  const progress = { interpolate: config => ({ config, phase: 0 }) };
  const delayed = { interpolate: config => ({ config, phase: 0.5 }) };
  const { RequestPickupBeacon } = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: x => x }, Animated: {
      View: 'Wave', add: (value, offset) => { assert.equal(value, progress); offsets.push(offset); return 'offset'; },
      modulo: (value, modulus) => { assert.equal(value, 'offset'); assert.equal(modulus, 1); return delayed; },
    } }, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/hooks/request-detail/useRequestPickupRipple': { useRequestPickupRipple: value => { enabled.push(value); return progress; } },
  })('features/request-detail/RequestPickupBeacon.tsx');
  const render = value => hooks.render(() => RequestPickupBeacon.type({ point: { x: 120, y: 230 }, enabled: value }));
  const tree = render(true), all = nodes(tree);
  assert.equal(tree.props.pointerEvents, 'none');
  assert.deepEqual(tree.props.style[1], { left: 120, top: 230 });
  assert.match(tree.props.accessibilityLabel, /Votre départ.*chercher ici/);
  assert.ok(all.some(node => node.type === 'Icon' && node.props.name === 'person'));
  assert.ok(all.some(node => node.type === 'Text' && node.props.children === 'Votre départ'));
  const waves = all.filter(node => node.type === 'Wave'); assert.equal(waves.length, 2);
  for (const wave of waves) {
    const style = wave.props.style[1];
    assert.deepEqual(style.transform[0].scale.config.outputRange, [0.25, 1.8]);
    assert.deepEqual(style.opacity.config.outputRange, [0, 0.32, 0]);
  }
  assert.deepEqual(waves.map(node => node.props.style[1].opacity.phase), [0, 0.5]);
  render(false); assert.equal(enabled.at(-1), false); assert.deepEqual(offsets, [0.5], 'stable native nodes across renders');
});
