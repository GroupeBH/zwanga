const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const point = { latitude: -4.32, longitude: 15.32 };
const event = coordinate => ({ nativeEvent: { coordinate } });
const region = coordinate => ({ ...coordinate, latitudeDelta: 0.01, longitudeDelta: 0.01 });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];

function fixture(t, os) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(), pressed = [], settled = [], animations = [], pans = [];
  const load = loader({ react: { ...React, ...hooks.react },
    'react-native': { Platform: { OS: os }, StyleSheet: { create: value => value, absoluteFillObject: {} }, View: 'View', Text: 'Text', ActivityIndicator: 'Spinner', TouchableOpacity: 'Button' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-maps': { __esModule: true, default: 'Map', Polyline: 'Polyline', PROVIDER_GOOGLE: 'google' },
    '@/utils/reanimated': { __esModule: true, default: { View: 'AnimatedView' }, useSharedValue: value => hooks.react.useRef({ value }).current, useAnimatedStyle: fn => fn(), withTiming: value => value, cancelAnimation() {} },
  });
  const { LocationPickerMap } = load('components/location-picker/LocationPickerMap.tsx');
  const props = { enabled: true, target: point, route: [], restrictToRoute: false,
    onPanStart: () => pans.push(1), onSettle: value => settled.push(value),
    onPress: value => { pressed.push(value); props.target = { ...value }; } };
  const render = () => hooks.render(() => LocationPickerMap.type(props));
  const map = () => nodes(render()).find(node => node.type === 'Map');
  const ready = () => {
    const native = map();
    native.props.ref.current = { animateToRegion: value => animations.push(value) };
    native.props.onLayout({ nativeEvent: { layout: { width: 350, height: 400 } } });
    native.props.onMapReady(); render();
  };
  t.after(() => hooks.unmount());
  return { hooks, props, pressed, settled, animations, pans, render, map, ready };
}

for (const os of ['android', 'ios']) {
  test(`${os}: tapping a map point selects/recenters it; later taps win during animation`, t => {
    const app = fixture(t, os);
    app.map().props.onPress(event(point));
    assert.deepEqual(app.pressed, [], 'ignore taps before map readiness');
    app.ready();
    const first = { latitude: -4.4, longitude: 15.4 }, last = { latitude: -4.5, longitude: 15.5 };
    app.map().props.onPress(event(first)); app.render();
    app.map().props.onRegionChange(region(first));
    app.map().props.onRegionChangeComplete(region(first));
    app.map().props.onPress(event(last)); app.render();
    assert.deepEqual(app.pressed, [first, last]);
    assert.deepEqual(app.animations.map(({ latitude, longitude }) => ({ latitude, longitude })), [first, last]);
    assert.deepEqual(app.settled, []);
    assert.deepEqual(app.pans, []);
    const native = app.map(); app.hooks.unmount();
    native.props.onPress(event(point));
    assert.deepEqual(app.pressed, [first, last], 'closed map ignores late events');
  });

  test(`${os}: a tap wins over a pending drag, even when returning to the previous selection`, t => {
    const app = fixture(t, os); app.ready();
    const dragged = { latitude: -4.4, longitude: 15.4 };
    const native = app.map();
    native.props.onRegionChange(region(dragged));
    native.props.onPress(event(point));
    // Simulate queued callbacks before React has applied the new camera target.
    native.props.onRegionChange(region(dragged));
    native.props.onRegionChangeComplete(region(dragged));
    app.render(); t.mock.timers.tick(500);
    assert.deepEqual(app.pressed, [point]);
    assert.deepEqual(app.settled, []);
    assert.equal(app.animations.at(-1).latitude, point.latitude);
    // A real new gesture can interrupt the programmatic animation immediately.
    app.map().props.onPanDrag();
    app.map().props.onRegionChange(region(dragged));
    app.map().props.onRegionChangeComplete(region(dragged));
    assert.deepEqual(app.settled, [region(dragged)]);
  });
}

test('Google Maps named places use the same selection path; old map instances cannot select after retry', t => {
  const app = fixture(t, 'android'); app.ready();
  const poi = { latitude: -4.35, longitude: 15.35 };
  const old = app.map();
  old.props.onPoiClick({ nativeEvent: { coordinate: poi, placeId: 'test-place', name: 'Lieu de test' } });
  app.render();
  assert.deepEqual(app.pressed, [poi]);
  assert.equal(app.animations.length, 1);
  t.mock.timers.tick(10_000);
  nodes(app.render()).find(node => node.type === 'Button').props.onPress();
  app.ready();
  old.props.onPress(event(point)); old.props.onPoiClick(event(point));
  assert.deepEqual(app.pressed, [poi]);
  app.map().props.onPoiClick(event(point));
  assert.deepEqual(app.pressed, [poi, point]);
});
