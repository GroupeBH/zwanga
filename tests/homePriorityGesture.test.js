const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

// Exercise gesture callbacks with native animation completion under test control.
// Native touch arbitration and the actual animation still need a device smoke test.
function fixture() {
  const hooks = hookHarness(), dismissed = [], animations = [], gestures = [], queued = [];
  let cancellations = 0;
  const load = loader({
    react: { ...hooks.react, useLayoutEffect: hooks.react.useEffect, memo: component => component },
    'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-gesture-handler': { GestureDetector: 'Detector', Gesture: { Pan: () => {
      const callbacks = {}, options = {}, pan = { callbacks, options };
      for (const name of ['enabled', 'activeOffsetX', 'failOffsetY', 'maxPointers', 'cancelsTouchesInView']) pan[name] = value => { options[name] = value; return pan; };
      for (const name of ['onStart', 'onUpdate', 'onEnd', 'onFinalize']) pan[name] = callback => { callbacks[name] = callback; return pan; };
      gestures.push(pan); return pan;
    } } },
    'react-native-reanimated': {
      default: { View: 'AnimatedView' }, __esModule: true,
      useSharedValue: value => hooks.react.useRef({ value }).current,
      useAnimatedStyle: factory => factory(),
      withTiming: (value, config, done) => { animations.push({ value, config, done }); return value; },
      cancelAnimation: () => { cancellations++; },
      runOnJS: callback => (...args) => queued.push(() => callback(...args)),
    },
  });
  const { SwipeableHomePriority } = load('components/home/SwipeableHomePriority.tsx');
  const props = { priorityKey: 'trip:first', enabled: true, onDismiss: key => dismissed.push(key), children: 'card' };
  const render = () => hooks.render(() => SwipeableHomePriority(props));
  render();
  return { hooks, props, render, dismissed, animations, gestures, queued, cancellations: () => cancellations,
    pan: () => gestures.at(-1), flush: () => { while (queued.length) queued.shift()(); } };
}

test('horizontal gestures are bounded, preserve vertical motion, and never call JS during dragging', () => {
  const app = fixture();
  assert.deepEqual(app.pan().options.activeOffsetX, [-18, 18]);
  assert.deepEqual(app.pan().options.failOffsetY, [-14, 14]);
  assert.equal(app.pan().options.maxPointers, 1);
  assert.equal(app.pan().options.cancelsTouchesInView, true);
  app.render(); assert.equal(app.gestures.length, 1);
  app.pan().callbacks.onStart();
  for (let i = 0; i < 100; i++) app.pan().callbacks.onUpdate({ translationX: i });
  assert.equal(app.queued.length, 0);
  assert.deepEqual(app.dismissed, []);
  app.pan().callbacks.onEnd({ translationX: 50, velocityX: 20 });
  assert.equal(app.animations.at(-1).value, 0);
  assert.equal(app.animations.at(-1).done, undefined);
  app.hooks.unmount();
});

test('left and right swipes dismiss once only after the native exit animation succeeds', () => {
  for (const sign of [-1, 1]) {
    const app = fixture();
    app.render().props.onLayout({ nativeEvent: { layout: { width: 400 } } });
    app.pan().callbacks.onEnd({ translationX: sign * 160, velocityX: 0 });
    const animation = app.animations.at(-1);
    assert.equal(Math.sign(animation.value), sign);
    assert.ok(Math.abs(animation.value) > 400);
    assert.deepEqual(app.dismissed, []);
    animation.done(false); app.flush();
    assert.deepEqual(app.dismissed, []);
    animation.done(true); animation.done(true); app.flush();
    assert.deepEqual(app.dismissed, ['trip:first']);
    app.hooks.unmount();
  }
});

test('cancellation returns the card, and leaving Home drops delayed animation callbacks', () => {
  for (const exit of ['blur', 'unmount']) {
    const app = fixture();
    app.pan().callbacks.onFinalize({}, false);
    assert.equal(app.animations.at(-1).value, 0);
    app.pan().callbacks.onEnd({ translationX: 150, velocityX: 0 });
    const animation = app.animations.at(-1);
    animation.done(true); // Already queued on JS when Home goes inactive.
    if (exit === 'blur') { app.props.enabled = false; app.render(); assert.equal(app.pan().options.enabled, false); }
    else app.hooks.unmount();
    app.flush();
    assert.deepEqual(app.dismissed, []);
    assert.ok(app.cancellations() > 1);
    if (exit === 'blur') app.hooks.unmount();
  }
});

test('the wrapper leaves its children intact and does not introduce a second press action', () => {
  const app = fixture();
  app.props.children = React.createElement('Button', { onPress() {} }, 'Trajet bientôt');
  const tree = app.render();
  const detector = tree.props.children[1];
  assert.equal(detector.type, 'Detector');
  assert.equal(detector.props.children.props.children, app.props.children);
  assert.equal(detector.props.children.props.collapsable, false);
  assert.equal(tree.props.onPress, undefined);
  assert.equal(tree.props.children[0].props.pointerEvents, 'none');
  app.hooks.unmount();
});

test('the reusable swipe label can describe a receipt without changing the Home default or gesture', () => {
  const app = fixture();
  const label = () => app.render().props.children[0].props.children[1].props.children;
  assert.equal(label(), 'Masquer sur l’accueil');
  app.props.dismissLabel = 'Masquer le récapitulatif';
  assert.equal(label(), 'Masquer le récapitulatif');
  assert.equal(app.gestures.length, 1);
  app.hooks.unmount();
});

test('returning to Home does not revive an old queued dismissal', () => {
  const app = fixture();
  app.pan().callbacks.onEnd({ translationX: 150, velocityX: 0 });
  app.animations.at(-1).done(true);
  app.props.enabled = false; app.render();
  app.props.enabled = true; app.render();
  app.flush();
  assert.deepEqual(app.dismissed, []);
  app.pan().callbacks.onEnd({ translationX: 150, velocityX: 0 });
  app.animations.at(-1).done(true); app.flush();
  assert.deepEqual(app.dismissed, ['trip:first']);
  app.hooks.unmount();
});

test('late native events cannot restart animation after blur or unmount', () => {
  for (const exit of ['blur', 'unmount']) {
    const app = fixture(), callbacks = app.pan().callbacks;
    callbacks.onEnd({ translationX: 150, velocityX: 0 });
    const completion = app.animations.at(-1).done;
    if (exit === 'blur') { app.props.enabled = false; app.render(); }
    else app.hooks.unmount();
    const animationCount = app.animations.length, cancellations = app.cancellations();
    for (let i = 0; i < 100; i++) {
      callbacks.onStart();
      callbacks.onUpdate({ translationX: 80 });
      callbacks.onEnd({ translationX: 150, velocityX: 0 });
      callbacks.onFinalize({}, false);
      completion(true);
    }
    assert.equal(app.animations.length, animationCount);
    assert.equal(app.cancellations(), cancellations);
    assert.equal(app.queued.length, 0);
    app.flush(); assert.deepEqual(app.dismissed, []);
    if (exit === 'blur') app.hooks.unmount();
  }
});

test('a second swipe cannot interrupt or duplicate an exit animation awaiting JS', () => {
  const app = fixture(), callbacks = app.pan().callbacks;
  callbacks.onEnd({ translationX: 150, velocityX: 0 });
  const animationCount = app.animations.length, cancellations = app.cancellations();
  for (let i = 0; i < 100; i++) {
    callbacks.onStart();
    callbacks.onUpdate({ translationX: -150 });
    callbacks.onEnd({ translationX: -150, velocityX: 0 });
    callbacks.onFinalize({}, false);
  }
  assert.equal(app.animations.length, animationCount);
  assert.equal(app.cancellations(), cancellations);
  app.animations.at(-1).done(true); app.flush();
  assert.deepEqual(app.dismissed, ['trip:first']);
  app.hooks.unmount();
});

test('invalid native measurements and gesture values never reach animated transforms', () => {
  const app = fixture();
  const transform = () => app.render().props.children[1].props.children.props.style.transform[0].translateX;
  for (const invalid of [NaN, Infinity, -Infinity]) {
    app.render().props.onLayout({ nativeEvent: { layout: { width: invalid } } });
    app.pan().callbacks.onUpdate({ translationX: invalid });
    assert.ok(Number.isFinite(transform()));
    app.pan().callbacks.onEnd({ translationX: invalid, velocityX: 0 });
    assert.equal(app.animations.at(-1).value, 0);
    assert.equal(app.animations.at(-1).done, undefined);
  }
  app.pan().callbacks.onUpdate({ translationX: 1e100 });
  assert.equal(transform(), 320);
  app.pan().callbacks.onEnd({ translationX: 150, velocityX: 0 });
  assert.ok(Number.isFinite(app.animations.at(-1).value));
  app.animations.at(-1).done(true); app.flush();
  assert.deepEqual(app.dismissed, ['trip:first']);
  app.hooks.unmount();
});

test('old native callbacks are ignored after refocus or replacement by another priority', () => {
  for (const change of ['refocus', 'replacement']) {
    const app = fixture(), old = app.pan().callbacks;
    old.onEnd({ translationX: 150, velocityX: 0 });
    const completion = app.animations.at(-1).done;
    if (change === 'refocus') {
      app.props.enabled = false; app.render(); app.props.enabled = true; app.render();
    } else { app.props.priorityKey = 'trip:next'; app.render(); }
    const animationCount = app.animations.length;
    old.onUpdate({ translationX: 120 });
    assert.equal(app.render().props.children[1].props.children.props.style.transform[0].translateX, 0);
    old.onEnd({ translationX: 150, velocityX: 0 });
    old.onFinalize({}, false);
    completion(true);
    assert.equal(app.animations.length, animationCount);
    assert.equal(app.queued.length, 0);
    app.pan().callbacks.onEnd({ translationX: 150, velocityX: 0 });
    app.animations.at(-1).done(true); app.flush();
    assert.deepEqual(app.dismissed, [app.props.priorityKey]);
    app.hooks.unmount();
  }
});

test('one hundred rapid departures and returns never replay a pending swipe', () => {
  const app = fixture();
  for (let i = 0; i < 100; i++) {
    const previous = app.pan().callbacks;
    previous.onEnd({ translationX: 150, velocityX: 0 });
    app.animations.at(-1).done(true);
    app.props.enabled = false; app.render();
    app.props.enabled = true; app.render();
    const count = app.animations.length;
    previous.onUpdate({ translationX: -150 });
    previous.onEnd({ translationX: -150, velocityX: 0 });
    previous.onFinalize({}, false);
    app.flush();
    assert.equal(app.animations.length, count);
    assert.deepEqual(app.dismissed, []);
    assert.equal(app.render().props.children[1].props.children.props.style.transform[0].translateX, 0);
  }
  app.pan().callbacks.onEnd({ translationX: 150, velocityX: 0 });
  app.animations.at(-1).done(true); app.flush();
  assert.deepEqual(app.dismissed, ['trip:first']);
  app.hooks.unmount();
});

test('a cancelled native exit can be retried without locking the priority', () => {
  const app = fixture();
  app.pan().callbacks.onEnd({ translationX: 150, velocityX: 0 });
  app.animations.at(-1).done(false);
  app.pan().callbacks.onFinalize({}, false);
  assert.equal(app.animations.at(-1).value, 0);
  app.pan().callbacks.onEnd({ translationX: -150, velocityX: 0 });
  app.animations.at(-1).done(true); app.flush();
  assert.deepEqual(app.dismissed, ['trip:first']);
  app.hooks.unmount();
});
