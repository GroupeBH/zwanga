const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const layout = (width = 400, height = 800) => ({ nativeEvent: { layout: { width, height } } });

function mapApp(t, platform = 'ios') {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness();
  const interactions = [];
  const warnings = [];
  const load = loader({
    react: hooks.react,
    'react-native': {
      Platform: { OS: platform },
      InteractionManager: { runAfterInteractions(callback) {
        const task = { callback, cancelled: false };
        interactions.push(task);
        return { cancel: () => { task.cancelled = true; } };
      } },
    },
    '@/utils/throttledWarning': { warnThrottled: (...args) => warnings.push(args) },
  });
  const { useNavigationMapLifecycle } = load('hooks/navigation/useNavigationMapLifecycle.ts');
  const props = { screenKey: 'trip-1', enabled: true, mapRef: { current: {} } };
  const render = () => hooks.render(() => useNavigationMapLifecycle(props));
  const mount = () => {
    render();
    interactions.splice(0).forEach(task => { if (!task.cancelled) task.callback(); });
    t.mock.timers.tick(500);
    return render();
  };
  t.after(() => hooks.unmount());
  return { props, render, mount, hooks, warnings, interactions };
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: commands wait for interactions, native readiness and nonzero layout`, t => {
    const app = mapApp(t, platform);
    let state = app.render();
    let commands = 0;
    const command = () => { commands++; };
    assert.equal(state.shouldRenderMap, false);
    assert.equal(state.runMapCommand(command), false);
    t.mock.timers.tick(1000);
    assert.equal(app.render().shouldRenderMap, false, 'still waiting for screen transition');
    state = app.mount();
    assert.equal(state.shouldRenderMap, true);
    state.onMapReady();
    state.onMapLayout(layout(0));
    assert.equal(state.runMapCommand(command), false);
    state.onMapLayout(layout(NaN));
    assert.equal(state.runMapCommand(command), false);
    state.onMapLayout(layout());
    assert.deepEqual(state.mapLayoutRef.current, { width: 400, height: 800 });
    assert.equal(app.render().isMapReady, true);
    assert.equal(state.runMapCommand(command), true);
    assert.equal(commands, 1);
    state.onMapLayout(layout(400, 0));
    assert.equal(state.mapLayoutRef.current, null);
    assert.equal(state.runMapCommand(command), false, 'layout can become invalid again');
  });

  test(`${platform}: map releases before navigation, double taps and stale native events are ignored`, t => {
    const app = mapApp(t, platform);
    const state = app.mount();
    state.onMapLayout(layout());
    state.onMapReady();
    let navigations = 0;
    assert.equal(state.navigateAfterRelease(() => navigations++), true);
    assert.equal(state.navigateAfterRelease(() => navigations++), false);
    state.onMapReady();
    assert.equal(app.render().shouldRenderMap, false);
    assert.equal(state.runMapCommand(() => assert.fail('released map')), false);
    const delay = platform === 'ios' ? 260 : 40;
    t.mock.timers.tick(delay - 1);
    assert.equal(navigations, 0);
    t.mock.timers.tick(1);
    assert.equal(navigations, 1);
    app.props.enabled = false;
    app.render();
    t.mock.timers.tick(2000);
    assert.equal(app.render().shouldRenderMap, false);
  });
}

test('backgrounding/reopening or changing trip rejects old readiness callbacks', t => {
  const app = mapApp(t);
  const old = app.mount();
  old.onMapLayout(layout());
  old.onMapReady();
  app.props.enabled = false;
  assert.equal(app.render().shouldRenderMap, false);
  assert.equal(app.render().mapLayoutRef.current, null);
  old.onMapReady();
  assert.equal(app.render().isMapReady, false);
  app.props.enabled = true;
  let current = app.mount();
  old.onMapLayout(layout());
  old.onMapReady();
  assert.equal(app.render().isMapReady, false);
  current.onMapReady();
  current.onMapLayout(layout());
  assert.equal(app.render().isMapReady, true);
  app.props.screenKey = 'trip-2';
  const next = app.mount();
  current.onMapReady();
  current.onMapLayout(layout());
  assert.equal(app.render().isMapReady, false);
  next.onMapReady();
  next.onMapLayout(layout());
  assert.equal(app.render().isMapReady, true);
});

test('unmount cancels delayed mounting and pending navigation', t => {
  const app = mapApp(t);
  let navigations = 0;
  app.render().navigateAfterRelease(() => navigations++);
  app.hooks.unmount();
  app.interactions.forEach(task => task.callback()); // Even an already-dispatched native callback is stale.
  t.mock.timers.tick(5000);
  assert.equal(navigations, 0);
});

test('failed/no-op navigation recovers with a fresh map and native readiness is required again', t => {
  const app = mapApp(t);
  const old = app.mount();
  let recoveries = 0;
  old.navigateAfterRelease(() => {}, () => recoveries++);
  t.mock.timers.tick(260);
  t.mock.timers.tick(1500);
  const current = app.render();
  assert.equal(recoveries, 1);
  assert.equal(current.shouldRenderMap, true);
  old.onMapReady();
  old.onMapLayout(layout());
  assert.equal(app.render().isMapReady, false);
  current.onMapLayout(layout());
  current.onMapReady();
  assert.equal(app.render().isMapReady, true);
  assert.equal(current.runMapCommand(() => { throw Error('native view unavailable'); }), false);
  assert.equal(app.warnings.length, 1);
});

function requestApp() {
  const hooks = hookHarness();
  const { useNavigationRequestGuard } = loader({ react: hooks.react })('hooks/navigation/useNavigationRequestGuard.ts');
  const props = { enabled: true, screenKey: 'trip-1' };
  const render = () => hooks.render(() => useNavigationRequestGuard(props.enabled, props.screenKey));
  return { props, render, hooks };
}

test('slow GPS/route requests stay single-flight across thousands of updates', () => {
  const app = requestApp();
  const state = app.render();
  const first = state.begin('route');
  for (let i = 0; i < 5000; i++) assert.equal(app.render().begin('route'), null);
  first.finish();
  assert.ok(state.begin('route'), 'the next update is sent once the previous request finishes');
  app.hooks.unmount();
});

test('a route change aborts the old request and its completion cannot unlock the new one', () => {
  const app = requestApp();
  const state = app.render();
  let aborts = 0;
  const old = state.begin('pickup-1');
  old.attach({ abort: () => aborts++ });
  const current = state.begin('pickup-2');
  assert.equal(aborts, 1);
  assert.equal(old.isCurrent(), false);
  old.finish();
  assert.equal(state.begin('pickup-2'), null);
  assert.equal(current.isCurrent(), true);
  current.finish();
  app.hooks.unmount();
});

test('request cleanup handles blur, trip changes, explicit exit and late REST fallback attachment', () => {
  const app = requestApp();
  let state = app.render();
  let aborts = 0;
  const old = state.begin('location');
  app.props.enabled = false;
  state = app.render();
  old.attach({ abort: () => aborts++ });
  assert.equal(aborts, 1);
  assert.equal(old.isCurrent(), false);
  assert.equal(state.begin('location'), null);
  app.props.enabled = true;
  state = app.render();
  const current = state.begin('location');
  current.attach({ abort: () => aborts++ });
  app.props.screenKey = 'trip-2';
  state = app.render();
  assert.equal(aborts, 2);
  assert.equal(current.isCurrent(), false);
  const next = state.begin('location');
  state.cancel();
  assert.equal(next.isCurrent(), false);
  state.begin('location').attach({ abort: () => aborts++ });
  app.hooks.unmount();
  assert.equal(aborts, 3);
});

function markerApp(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness();
  const { useNavigationMarkerRefresh } = loader({
    react: hooks.react, '@/utils/throttledWarning': { warnThrottled() {} },
  })('hooks/navigation/useNavigationMarkerRefresh.ts');
  const props = { enabled: true, screenKey: 'trip-1' };
  const render = () => hooks.render(() => useNavigationMarkerRefresh(props.enabled, props.screenKey));
  t.after(() => hooks.unmount());
  return { props, render, hooks };
}

test('Android markers only redraw twice per native instance despite repeated ready events', t => {
  const app = markerApp(t);
  let redraws = 0;
  const marker = { redraw: () => redraws++ };
  for (let i = 0; i < 1000; i++) app.render().onReady('passenger', () => marker);
  t.mock.timers.tick(320);
  assert.equal(redraws, 2);
  assert.equal(app.render().isLoaded('passenger'), true);
  for (let i = 0; i < 1000; i++) {
    app.render().onReady('passenger', () => marker);
    t.mock.timers.tick(5000);
  }
  assert.equal(redraws, 2);
});

test('marker removal, map release and unmount cancel redraws of old native views', t => {
  const app = markerApp(t);
  let redraws = 0;
  let marker = { redraw: () => redraws++ };
  app.render().onReady('passenger', () => marker);
  marker = null;
  t.mock.timers.tick(320);
  assert.equal(redraws, 0);
  marker = { redraw: () => redraws++ };
  app.render().onReady('passenger', () => marker);
  app.props.enabled = false;
  app.render();
  t.mock.timers.tick(320);
  assert.equal(redraws, 0);
  app.props.enabled = true;
  const state = app.render();
  state.onReady('passenger', () => marker);
  t.mock.timers.tick(320);
  assert.equal(redraws, 2);
  state.onReady('pickup', () => marker);
  app.hooks.unmount();
  t.mock.timers.tick(320);
  assert.equal(redraws, 2);
});
