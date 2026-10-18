const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function etaFixture() {
  const hooks = hookHarness(), reads = [], estimates = [];
  const { useTripDetailArrivalEstimate } = loader({ react: hooks.react,
    '@/utils/routeApi': { getRouteInfo: (origin, destination) => {
      const pending = deferred(); reads.push({ ...pending, origin, destination }); return pending.promise;
    } },
  })('hooks/trip-detail/useTripDetailArrivalEstimate.ts');
  const props = { enabled: true, tripId: 'trip', origin: { latitude: -4.3, longitude: 15.3 },
    destination: { latitude: -4.4, longitude: 15.4 }, duration: 600, progress: 20,
    onEstimate: value => estimates.push(value) };
  return { props, hooks, reads, estimates, render: () => hooks.render(() => useTripDetailArrivalEstimate({ ...props })) };
}

test('ETA coalesces moving GPS samples, waits 30 seconds and allows only one pending read', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const app = etaFixture(); app.render(); t.mock.timers.tick(0);
  assert.equal(app.reads.length, 1);
  for (let i = 0; i < 20; i++) {
    app.props.origin = { latitude: -4.31 - i / 10000, longitude: 15.3 };
    app.render(); t.mock.timers.tick(1000);
  }
  assert.equal(app.reads.length, 1);
  app.reads[0].resolve({ duration: 90 }); await settle();
  assert.equal(app.estimates.length, 1);
  t.mock.timers.tick(9999); assert.equal(app.reads.length, 1);
  t.mock.timers.tick(1); assert.equal(app.reads.length, 2);
  assert.deepEqual(app.reads[1].origin, app.props.origin);
  app.hooks.unmount();
  app.reads[1].resolve({ duration: 10 }); await settle();
  t.mock.timers.tick(300000);
  assert.equal(app.estimates.length, 1); assert.equal(app.reads.length, 2);
});

test('stationary ETA refreshes after two minutes and blur cancels timers and late responses', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const app = etaFixture(); app.render(); t.mock.timers.tick(0);
  app.reads[0].resolve({ duration: 90 }); await settle();
  t.mock.timers.tick(119999); assert.equal(app.reads.length, 1);
  t.mock.timers.tick(1); assert.equal(app.reads.length, 2);
  app.props.enabled = false; app.render();
  app.reads[1].resolve({ duration: 1000 }); await settle();
  assert.equal(app.estimates.at(-1), null);
  t.mock.timers.tick(300000); assert.equal(app.reads.length, 2);
  app.props.enabled = true; app.render(); t.mock.timers.tick(0);
  assert.equal(app.reads.length, 3);
  app.reads[2].reject(new Error('offline')); await settle();
  assert.equal(app.estimates.at(-1).getTime(), Date.now() + 480000);
  app.hooks.unmount();
});

function searchFixture() {
  const hooks = hookHarness(), reads = [], events = [];
  const trigger = payload => {
    const pending = deferred();
    const request = { ...pending, payload, aborted: false,
      unwrap: () => pending.promise, abort() { this.aborted = true; } };
    reads.push(request); return request;
  };
  const { useLatestTripSearch } = loader({ react: hooks.react,
    '@/store/api/tripApi': { useSearchTripsByCoordinatesMutation: () => [trigger] },
    '@/services/analytics': { trackEvent: (...args) => events.push(args) },
    '@/utils/errorHelpers': { getApiErrorMessage: (_error, fallback) => fallback },
  })('hooks/search/useLatestTripSearch.ts');
  return { hooks, reads, events, render: (enabled = true) => hooks.render(() => useLatestTripSearch(enabled)) };
}

test('search debounces quick changes and rejects stale responses even when abort cannot stop the server', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = searchFixture(), search = app.render();
  search.run({ minSeats: 1 }); t.mock.timers.tick(200);
  search.run({ minSeats: 2 }); t.mock.timers.tick(349);
  assert.equal(app.reads.length, 0); t.mock.timers.tick(1);
  search.run({ minSeats: 4 }); assert.equal(app.reads[0].aborted, true);
  t.mock.timers.tick(350);
  app.reads[1].resolve([{ id: 'latest' }]); await settle();
  app.reads[0].resolve([{ id: 'obsolete' }]); await settle();
  assert.deepEqual(app.render().trips, [{ id: 'latest' }]);
  assert.equal(app.render().loading, false); assert.equal(app.events.length, 1);
  app.hooks.unmount();
});

test('search stops on blur/unmount and a fresh request still works after returning', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = searchFixture(); app.render().run({ minSeats: 2 }); t.mock.timers.tick(350);
  app.render(false); assert.equal(app.reads[0].aborted, true);
  app.reads[0].reject(new Error('aborted')); await settle();
  assert.equal(app.render(false).error, null);
  app.render().run({ minSeats: 3 }); t.mock.timers.tick(350);
  app.reads[1].resolve([{ id: 'return' }]); await settle();
  assert.deepEqual(app.render().trips, [{ id: 'return' }]);
  app.render().run({ minSeats: 4 }); app.hooks.unmount(); t.mock.timers.tick(1000);
  assert.equal(app.reads.length, 2);
});
