const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { freshEntryData, ENTRY_CACHE_MAX_AGE_MS } = loader()('features/navigation/entryFreshness.ts');

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const hooks = hookHarness(), routes = [];
  const env = { version: 0, userId: 'driver', active: true, ready: true, path: '/', fastHome: false,
    replace: destination => { routes.push(destination); } };
  const { useEntryPresentation } = loader({ react: hooks.react,
    '@/services/tokenSession': { getTokenSessionVersion: () => env.version },
  })('hooks/navigation/useEntryPresentation.ts');
  t.after(() => hooks.unmount());
  return { env, routes, hooks, render: () => hooks.render(() => useEntryPresentation(env)) };
}

test('one 2-second budget, then late verified destinations require a deliberate tap', t => {
  const f = fixture(t);
  assert.equal(f.render().released, false);
  t.mock.timers.tick(1999); assert.equal(f.render().released, false);
  t.mock.timers.tick(1); assert.equal(f.render().released, true);
  assert.equal(f.render().replace('/trip/navigate/ride'), false);
  assert.deepEqual(f.routes, []);
  assert.equal(f.render().proposal, '/trip/navigate/ride');
  f.render().open(); assert.deepEqual(f.routes, ['/trip/navigate/ride']);
  assert.equal(f.render().proposal, null);
  f.render().open(); assert.equal(f.routes.length, 1, 'double tap cannot navigate twice');
});

test('the deadline is enforced even before the timer-driven render; a quick result still navigates', t => {
  const f = fixture(t), initial = f.render();
  assert.equal(initial.replace('/booking/navigate/booking'), true);
  assert.equal(f.routes.length, 1);
  t.mock.timers.tick(2000);
  assert.equal(initial.replace('/request-details/request'), false);
  assert.equal(f.routes.length, 1);
});

test('settled Home and retry never reopen a cover or permit a late automatic redirect', t => {
  const f = fixture(t); f.render().reveal();
  assert.equal(f.render().released, true);
  assert.equal(f.render().replace('/request-details/request'), false);
  f.env.path = '/publish'; f.render();
  assert.equal(f.render().proposal, null);
  f.env.path = '/'; assert.equal(f.render().released, true);
  assert.deepEqual(f.routes, []);
});

test('startup/auth do not consume the short budget before a mounted eligible screen', t => {
  const f = fixture(t); f.env.path = '/auth'; f.env.ready = false;
  f.render(); t.mock.timers.tick(30000); assert.equal(f.render().released, false);
  f.env.path = '/'; f.env.ready = true; assert.equal(f.render().released, false);
  assert.equal(f.render().replace('/trip/navigate/ride'), true);
});

test('fresh empty activity may reveal Home immediately, with no subsequent forced route', t => {
  const f = fixture(t); f.env.fastHome = true;
  assert.equal(f.render().released, true);
  assert.equal(f.render().replace('/incoming-driver'), false);
  f.env.fastHome = false; assert.equal(f.render().released, true);
});

test('old callbacks cannot navigate after account, session, background or unmount changes', t => {
  const f = fixture(t);
  for (const change of [() => { f.env.userId = 'other'; }, () => { f.env.version++; },
    () => { f.env.active = false; }, () => { f.hooks.unmount(); }]) {
    f.env.active = true; const old = f.render(); old.reveal(); old.replace('/trip/navigate/ride');
    change(); if (f.env.active || f.env.userId) f.render();
    old.open();
    assert.throws(() => old.replace('/trip/navigate/ride'), /STALE/);
    assert.deepEqual(f.routes, []);
  }
});

test('entry cache reuse requires a healthy, completed and recent read, never a pending/error/future result', () => {
  const data = { id: 'ride' }, read = { data, isSuccess: true, fulfilledTimeStamp: 100000 };
  assert.equal(freshEntryData(read, 100001), data);
  for (const patch of [{ isSuccess: false }, { isError: true }, { isFetching: true }, { status: 'pending' },
    { fulfilledTimeStamp: undefined }, { fulfilledTimeStamp: NaN }, { fulfilledTimeStamp: 100002 },
    { fulfilledTimeStamp: 100001 - ENTRY_CACHE_MAX_AGE_MS }]) {
    assert.equal(freshEntryData({ ...read, ...patch }, 100001), undefined);
  }
});

test('verified requests open directly after the visual deadline, without extending the cover', t => {
  const f = fixture(t); f.render(); t.mock.timers.tick(3000);
  assert.equal(f.render().released, true);
  assert.equal(f.render().replaceRequest('/request-details/order'), true);
  assert.deepEqual(f.routes, ['/request-details/order']);
  assert.equal(f.render().proposal, null); assert.equal(f.render().released, true);
});

test('a late ringing dispatch opens automatically even after a fresh empty Home was revealed', t => {
  const f = fixture(t); f.env.fastHome = true; f.render(); t.mock.timers.tick(5000);
  const offer = { pathname: '/incoming-driver', params: { id: 'offer', kind: 'dispatch', driverId: 'driver' } };
  assert.equal(f.render().replaceRequest(offer), true); assert.deepEqual(f.routes, [offer]);
});

test('request automation cannot override deliberate navigation, including leaving and returning to fast Home', t => {
  const f = fixture(t); f.env.fastHome = true; const initial = f.render();
  f.env.path = '/publish'; f.render(); f.env.path = '/'; f.render();
  assert.equal(initial.replaceRequest('/request-details/order'), false);
  assert.deepEqual(f.routes, []);
});

test('request automation cannot bypass the normal policy for a trip, payment or unrelated destination', t => {
  const f = fixture(t); f.render(); t.mock.timers.tick(3000);
  for (const destination of ['/trip/navigate/ride', '/wallet', '/incoming-driver',
    { pathname: '/incoming-driver', params: { kind: 'booking' } }]) {
    assert.equal(f.render().replaceRequest(destination), false);
  }
  assert.deepEqual(f.routes, []);
});

test('late request callbacks cannot survive backgrounding, signout or account changes', t => {
  const f = fixture(t);
  for (const change of [() => { f.env.active = false; }, () => { f.env.userId = 'other'; }, () => { f.env.version++; }]) {
    f.env.active = true; const initial = f.render(); t.mock.timers.tick(3000);
    change(); f.render(); assert.throws(() => initial.replaceRequest('/request-details/order'), /STALE/);
  }
  assert.deepEqual(f.routes, []);
});
