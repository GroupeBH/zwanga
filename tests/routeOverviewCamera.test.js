const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const a = { latitude: -4.3, longitude: 15.3 }, b = { latitude: -4.4, longitude: 15.4 };
function setup(platform = 'android') {
  const h = hookHarness();
  const load = loader({ react: h.react, 'react-native': { Platform: { OS: platform } } });
  const { useRouteOverviewCamera } = load('hooks/maps/useRouteOverviewCamera.ts');
  const { useStableMapRoute } = load('hooks/maps/useStableMapRoute.ts');
  const calls = [], map = { fitToCoordinates: (...args) => calls.push(args) };
  const props = { routeKey: 'a:b', coordinates: [a, b], isReady: false, edgePadding: { top: 70, bottom: 70, left: 36, right: 36 },
    mapLayoutRef: { current: { width: 320, height: 240 } }, runMapCommand: callback => { callback(map); return true; } };
  return { calls, props, render: () => h.render(() => {
    const stable = useStableMapRoute(props.coordinates);
    return { stable, ...useRouteOverviewCamera({ ...props, coordinates: stable }) };
  }), unmount: h.unmount };
}
test('overview waits for readiness and preserves geometry identity over 100 cloned responses', () => {
  const f = setup(); f.render(); assert.equal(f.calls.length, 0);
  f.props.isReady = true; const first = f.render(); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][1].animated, false);
  for (let n = 0; n < 100; n++) { f.props.coordinates = [ { ...a }, { ...b } ]; assert.equal(f.render().stable, first.stable); }
  assert.equal(f.calls.length, 1); f.unmount();
});
test('pan or Google zoom preserves user framing when a later road extends the bounds', () => {
  for (const gesture of [camera => camera.onPanDrag(), camera => camera.onRegionChangeComplete({}, { isGesture: true })]) {
    const f = setup(); f.props.isReady = true; gesture(f.render());
    f.props.coordinates = [a, { latitude: -4.5, longitude: 15.5 }, b]; f.render();
    assert.equal(f.calls.length, 1);
    f.render().recenter(); assert.equal(f.calls.length, 2); assert.equal(f.calls[1][1].animated, true);
    f.unmount();
  }
});
test('recenter ignores rapid repeat presses and retains nonanimated iOS safety', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  for (const os of ['android', 'ios']) {
    const f = setup(os); f.props.isReady = true; const camera = f.render();
    for (let n = 0; n < 100; n++) camera.recenter();
    assert.equal(f.calls.length, 2); assert.equal(f.calls.at(-1)[1].animated, os === 'android');
    t.mock.timers.tick(400); camera.recenter(); assert.equal(f.calls.length, 3); f.unmount();
  }
});
test('new endpoints and reopening reset framing; hidden maps and invalid layouts cannot fit', () => {
  const f = setup(); f.props.isReady = true; f.render().onPanDrag();
  f.props.routeKey = 'a:c'; f.props.coordinates = [a, { latitude: -4.6, longitude: 15.6 }];
  f.render(); assert.equal(f.calls.length, 2);
  f.props.isReady = false; f.render().recenter(); assert.equal(f.calls.length, 2);
  f.props.isReady = true; f.render(); assert.equal(f.calls.length, 3);
  f.props.mapLayoutRef.current = { width: 0, height: 240 }; f.render(); assert.equal(f.calls.length, 3);
  f.props.mapLayoutRef.current = { width: 400, height: 200 }; f.render(); assert.equal(f.calls.length, 4);
  assert.ok(f.calls.at(-1)[1].edgePadding.top + f.calls.at(-1)[1].edgePadding.bottom <= 120);
  f.unmount();
});
test('preview geometry is bounded and rejects invalid arrays without mutating navigation data', () => {
  const f = setup();
  const many = Array.from({ length: 2000 }, (_, i) => ({ latitude: -4.3 - i / 20000, longitude: 15.3 + i / 20000 }));
  f.props.coordinates = many; const stable = f.render().stable;
  assert.equal(stable.length, 512); assert.equal(many.length, 2000);
  assert.deepEqual([stable[0], stable.at(-1)], [many[0], many.at(-1)]);
  f.props.coordinates = [a, { latitude: NaN, longitude: 15 }]; assert.deepEqual(f.render().stable, []);
  f.unmount();
});
