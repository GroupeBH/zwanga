const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture() {
  const hooks = hookHarness();
  const calls = [], values = [];
  let resolveSetting, rejectSetting, event;
  const settings = new Promise((resolve, reject) => { resolveSetting = resolve; rejectSetting = reject; });
  class Value {
    constructor(value) { this.value = value; values.push(this); }
    setValue(value) { this.value = value; calls.push(['value', value]); }
    stopAnimation() { calls.push(['stop-value']); }
    interpolate(config) { return config; }
  }
  const load = loader({
    react: hooks.react,
    'react-native': {
      AccessibilityInfo: { isReduceMotionEnabled: () => settings,
        addEventListener: (name, callback) => { assert.equal(name, 'reduceMotionChanged'); event = callback;
          return { remove: () => calls.push(['unsubscribe']) }; } },
      Animated: { Value, timing: (_, options) => { calls.push(['timing', options]); return {}; },
        loop: () => ({ start: () => calls.push(['start']), stop: () => calls.push(['stop']) }) },
      Easing: { quad: 'quad', inOut: value => value },
    },
  });
  const { useHomeLoaderMotion } = load('hooks/home/useHomeLoaderMotion.ts');
  return { hooks, calls, values, resolveSetting, rejectSetting, event: value => event(value),
    render: (enabled = true) => hooks.render(() => useHomeLoaderMotion(enabled)) };
}

test('journey uses a bounded static curve whose coordinates and heading stay inside the illustration', () => {
  const { HOME_LOADER_WAYPOINTS: points } = loader()('features/home/homeLoaderJourney.ts');
  assert.equal(points.length, 49);
  assert.deepEqual(points[0], { t: 0, x: 44, y: 178, heading: '0deg' });
  assert.deepEqual(points.at(-1), { t: 1, x: 248, y: 70, heading: '0deg' });
  points.forEach((point, index) => {
    assert.ok(point.x >= 44 && point.x <= 248);
    assert.ok(point.y >= 70 && point.y <= 178);
    assert.ok(Number.isFinite(parseFloat(point.heading)));
    if (index) assert.ok(point.t > points[index - 1].t);
  });
});

test('one native nonblocking animation drives both car and halo, without rebuilding interpolation nodes', async () => {
  const app = fixture();
  const first = app.render();
  assert.equal(app.values[0].value, 0.5);
  assert.equal(app.calls.some(([name]) => name === 'start'), false, 'wait for the motion preference');
  app.resolveSetting(false); await Promise.resolve();
  const moving = app.render();
  assert.equal(moving, first);
  const timing = app.calls.filter(([name]) => name === 'timing');
  assert.equal(timing.length, 1);
  assert.equal(timing[0][1].useNativeDriver, true);
  assert.equal(timing[0][1].isInteraction, false);
  assert.equal(timing[0][1].duration, 3600);
  assert.equal(app.calls.filter(([name]) => name === 'start').length, 1);
  assert.equal(app.render(), moving);
  assert.equal(app.values.length, 1);
  assert.equal(app.calls.filter(([name]) => name === 'start').length, 1);
  app.hooks.unmount();
  assert.ok(app.calls.some(([name]) => name === 'stop'));
  assert.ok(app.calls.some(([name]) => name === 'unsubscribe'));
});

test('blur/background/error stops the animation; repeated renders cannot create concurrent loops', async () => {
  const app = fixture(); app.render();
  app.resolveSetting(false); await Promise.resolve(); app.render();
  for (let i = 0; i < 20; i++) {
    app.render(false);
    assert.equal(app.values[0].value, 0.5);
    assert.equal(app.calls.filter(([name]) => name === 'start').length, app.calls.filter(([name]) => name === 'stop').length);
    app.render(false);
    app.render(true);
  }
  app.hooks.unmount();
  assert.equal(app.calls.filter(([name]) => name === 'start').length, app.calls.filter(([name]) => name === 'stop').length);
  assert.equal(app.calls.filter(([name]) => name === 'unsubscribe').length, 1);
});

test('reduced motion keeps a static visible car and reacts to setting changes', async () => {
  const app = fixture(); app.render();
  app.resolveSetting(true); await Promise.resolve(); app.render();
  assert.equal(app.calls.some(([name]) => name === 'start'), false);
  assert.equal(app.values[0].value, 0.5);
  app.event(false); app.render();
  assert.equal(app.calls.filter(([name]) => name === 'start').length, 1);
  app.event(true); app.render();
  assert.equal(app.calls.filter(([name]) => name === 'stop').length, 1);
  assert.equal(app.values[0].value, 0.5);
  app.hooks.unmount();
});

test('a late settings read cannot override a newer accessibility event', async () => {
  const app = fixture(); app.render();
  app.event(true);
  app.resolveSetting(false); await Promise.resolve(); app.render();
  assert.equal(app.calls.some(([name]) => name === 'start'), false);
  app.hooks.unmount();
});

test('preference failure or completion after unmount cannot start an animation', async () => {
  const failed = fixture(); failed.render(); failed.rejectSetting(new Error('native unavailable'));
  await Promise.resolve(); await Promise.resolve(); failed.render();
  assert.equal(failed.calls.some(([name]) => name === 'start'), false);
  failed.hooks.unmount();
  const late = fixture(); late.render(); late.hooks.unmount(); late.resolveSetting(false);
  await Promise.resolve();
  assert.equal(late.calls.some(([name]) => name === 'start'), false);
});

test('illustration uses vectors only, hides decorative content from screen readers and forwards running state', () => {
  const calls = [];
  const load = loader({
    '@/hooks/home/useHomeLoaderMotion': { useHomeLoaderMotion: running => { calls.push(running); return { car: {}, halo: {} }; } },
    'react-native': { Animated: { View: 'AnimatedView' }, View: 'View', StyleSheet: { create: value => value } },
    'react-native-svg': { __esModule: true, default: 'Svg', Circle: 'Circle', G: 'G', Path: 'Path', Rect: 'Rect' },
  });
  const { HomeRideLoaderVisual } = load('components/home/HomeRideLoaderVisual.tsx');
  function nodes(element) {
    if (Array.isArray(element)) return element.flatMap(nodes);
    return React.isValidElement(element) ? [element, ...nodes(element.props.children)] : [];
  }
  for (const running of [true, false]) {
    const tree = HomeRideLoaderVisual({ running });
    assert.equal(calls.at(-1), running);
    assert.equal(tree.props.pointerEvents, 'none');
    assert.equal(tree.props.accessibilityElementsHidden, true);
    assert.equal(tree.props.importantForAccessibility, 'no-hide-descendants');
    assert.ok(tree.props.style.width <= 296, 'fits a 320-point phone with page gutters');
    const rendered = nodes(tree);
    assert.equal(rendered.filter(node => node.type === 'Svg').length, 3);
    assert.equal(rendered.filter(node => node.type === 'AnimatedView').length, 2);
    assert.ok(rendered.some(node => node.props.testID === 'home-loader-car'));
    assert.ok(rendered.some(node => node.props.testID === 'home-loader-arrival-halo'));
  }
});
