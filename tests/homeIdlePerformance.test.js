const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const region = { latitude: -4.325, longitude: 15.3222, latitudeDelta: 0.025, longitudeDelta: 0.025 };

function camera(platform = 'ios') {
  const hooks = hookHarness(), movements = [];
  const { useHomeMapCamera } = loader({ react: hooks.react,
    'react-native': { Platform: { OS: platform } }, 'react-native-maps': {},
  })('hooks/home/useHomeMapCamera.ts');
  const mapRef = { current: { animateToRegion: (...args) => movements.push(args) } };
  const render = (target = region, enabled = true) => hooks.render(() => useHomeMapCamera(mapRef, enabled, target));
  const mount = () => {
    const handlers = render();
    handlers.attachHomeMap(mapRef.current);
    handlers.onHomeMapReady();
    handlers.onHomeMapLayout({ nativeEvent: { layout: { width: 400, height: 600 } } });
    return render();
  };
  return { hooks, movements, render, mount, mapRef };
}

test('one thousand stationary Home updates do not repeat the native camera animation', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const app = camera();
  app.mount();
  for (let i = 0; i < 1000; i++) {
    t.mock.timers.tick(5000);
    app.render({ ...region, latitude: region.latitude + (i % 2) * 0.00001 });
  }
  assert.equal(app.movements.length, 1);
  app.render({ ...region, latitude: region.latitude + 0.001 });
  assert.equal(app.movements.length, 2);
  app.hooks.unmount();
});

for (const [platform, interval] of [['ios', 1200], ['android', 700]]) {
  test(`${platform}: camera follows the newest point within its throttle and cancels on release`, t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
    const app = camera(platform);
    app.mount();
    app.render({ ...region, latitude: -4.33 });
    t.mock.timers.tick(interval - 1);
    app.render({ ...region, latitude: -4.34 });
    assert.equal(app.movements.length, 1);
    t.mock.timers.tick(1);
    assert.equal(app.movements.length, 2);
    assert.equal(app.movements[1][0].latitude, -4.34);
    app.render({ ...region, latitude: -4.35 });
    app.render({ ...region, latitude: -4.35 }, false);
    t.mock.timers.tick(5000);
    assert.equal(app.movements.length, 2);
    app.render();
    assert.equal(app.movements.length, 3);
    app.render({ ...region, latitude: -4.36 });
    app.hooks.unmount();
    t.mock.timers.tick(5000);
    assert.equal(app.movements.length, 3);
  });
}

test('Home camera waits for native readiness AND nonzero layout, in either event order', () => {
  for (const readyFirst of [true, false]) {
    const app = camera('android'), handlers = app.render();
    handlers.attachHomeMap(app.mapRef.current);
    const layout = (width, height) => handlers.onHomeMapLayout({ nativeEvent: { layout: { width, height } } });
    if (readyFirst) handlers.onHomeMapReady();
    for (const dimensions of [[0, 600], [400, 0], [NaN, 600]]) {
      layout(...dimensions); app.render();
      assert.equal(app.movements.length, 0);
    }
    layout(400, 600); app.render();
    assert.equal(app.movements.length, readyFirst ? 1 : 0);
    handlers.onHomeMapReady(); app.render();
    assert.equal(app.movements.length, 1);
    app.hooks.unmount();
  }
});

test('map replacement cancels queued movements and requires new ready/layout events', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const app = camera('android');
  const handlers = app.mount();
  app.render({ ...region, latitude: -4.4 });
  handlers.attachHomeMap(null);
  const replacement = [];
  handlers.attachHomeMap({ animateToRegion: value => replacement.push(value) });
  t.mock.timers.tick(5000);
  assert.equal(app.movements.length, 1);
  assert.equal(replacement.length, 0);
  const next = app.render(); next.onHomeMapReady();
  next.onHomeMapLayout({ nativeEvent: { layout: { width: 400, height: 600 } } });
  app.render(); assert.equal(replacement.length, 1);
  app.hooks.unmount();
});

test('manual recenter rejects inactive/unready/invalid regions and catches bridge errors', () => {
  const app = camera('android'), handlers = app.render();
  assert.equal(handlers.animateHomeMapToRegion(region), false);
  app.mount();
  assert.equal(handlers.animateHomeMapToRegion({ ...region, longitude: Infinity }), false);
  assert.equal(handlers.animateHomeMapToRegion({ ...region, latitudeDelta: 0 }), false);
  app.render(region, false);
  assert.equal(handlers.animateHomeMapToRegion(region), false);
  app.render();
  app.mapRef.current.animateToRegion = () => { throw Error('Synthetic native bridge failure'); };
  assert.equal(handlers.animateHomeMapToRegion(region), false);
  app.hooks.unmount();
});

test('GPS jitter with unchanged rounded coordinates neither recreates the feed nor dispatches a new Redux list', () => {
  const hooks = hookHarness(), dispatches = [], payloads = [];
  const trips = [{ id: 'trip', departureTime: new Date(Date.now() + 3600000).toISOString() }];
  const { useHomeTripFeed } = loader({ react: hooks.react,
    '@/store/hooks': { useAppSelector: selector => selector({ zwangaApi: { config: { online: true } } }) },
    'react-native': { StyleSheet: { create: value => value } },
    '@/store/api/tripApi': {
      useGetTripsQuery: () => ({ currentData: trips }),
      useGetTripsByCoordinatesQuery: (payload, options) => { payloads.push({ payload, options }); return { currentData: trips }; },
    },
  })('hooks/home/useHomeTripFeed.ts');
  const props = { isFocused: true, storedTrips: [], locationRadiusKm: 5,
    dispatch: action => dispatches.push(action), lastKnownLocation: { coords: region } };
  const render = () => hooks.render(() => useHomeTripFeed(props));
  const first = render();
  for (let i = 0; i < 100; i++) {
    props.lastKnownLocation = { coords: { ...region, latitude: region.latitude + (i % 2) * 0.000001 } };
    assert.equal(render().remoteTrips, first.remoteTrips);
    assert.equal(payloads.at(-1).payload, payloads[0].payload);
  }
  assert.equal(dispatches.length, 1);
  props.isFocused = false; render();
  assert.equal(payloads.at(-1).options.skip, true);
  hooks.unmount();
});
