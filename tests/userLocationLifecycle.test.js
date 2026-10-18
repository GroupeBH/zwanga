const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const fix = { coords: { latitude: -4.325, longitude: 15.3222, accuracy: 20 }, timestamp: 1000 };

function fixture(overrides = {}, options = {}) {
  const hooks = hookHarness(), listeners = new Set(), watches = [], actions = [], calls = [];
  const AppState = { currentState: 'active', addEventListener: (_event, callback) => {
    listeners.add(callback); return { remove: () => listeners.delete(callback) };
  } };
  const state = { permission: { status: 'granted', canAskAgain: true }, cached: fix, enabled: true };
  const location = {
    Accuracy: { Balanced: 'balanced', High: 'high' }, PermissionStatus: { GRANTED: 'granted' },
    getForegroundPermissionsAsync: async () => { calls.push('get-permission'); return state.permission; },
    requestForegroundPermissionsAsync: async () => { calls.push('request-permission'); return state.permission; },
    hasServicesEnabledAsync: async () => state.enabled,
    watchPositionAsync: async (options, callback) => {
      const subscription = { options, callback, removed: false, remove() { this.removed = true; } };
      watches.push(subscription); return subscription;
    },
    getLastKnownPositionAsync: async options => { calls.push(['cached', options]); return state.cached; },
    getCurrentPositionAsync: async options => { calls.push(['current', options]); return fix; },
    ...overrides,
  };
  const dispatch = action => actions.push(action);
  const { useUserLocation } = loader({ react: hooks.react, 'react-native': { AppState }, 'expo-location': location,
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: () => null }, '@/store/selectors': {},
  })('hooks/useUserLocation.ts');
  const props = { autoRequest: true, trackingProfile: 'nearby', ...options };
  return { hooks, props, watches, actions, calls, state, AppState, listeners,
    render: () => hooks.render(() => useUserLocation(props)),
    setAppState(value) { AppState.currentState = value; [...listeners].forEach(callback => callback(value)); },
  };
}

test('fifty brief Android permission/activity transitions keep one watcher and never request an already granted permission', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = fixture(); app.render(); await tick();
  for (let i = 0; i < 50; i++) {
    app.setAppState('background'); app.render();
    t.mock.timers.tick(100);
    app.setAppState('active'); app.render(); await tick();
  }
  assert.equal(app.watches.length, 1);
  assert.equal(app.watches[0].removed, false);
  assert.deepEqual(app.calls, ['get-permission']);
  assert.equal(app.watches[0].options.mayShowUserSettingsDialog, false);
  assert.equal(app.watches[0].options.accuracy, 'balanced');
  app.hooks.unmount();
  assert.equal(app.watches[0].removed, true);
  assert.equal(app.listeners.size, 0);
});

test('real background stops GPS after two seconds; resume restarts without a permission prompt and rejects stale callbacks', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = fixture(); app.render(); await tick();
  const first = app.watches[0];
  app.setAppState('background'); first.callback(fix);
  assert.equal(app.actions.some(action => action.type === 'location/setLastKnownLocation'), false);
  t.mock.timers.tick(1999); assert.equal(first.removed, false);
  t.mock.timers.tick(1); assert.equal(first.removed, true);
  app.setAppState('active'); await tick();
  assert.equal(app.watches.length, 2);
  first.callback(fix);
  assert.equal(app.actions.some(action => action.type === 'location/setLastKnownLocation'), false);
  app.watches[1].callback(fix);
  assert.equal(app.actions.filter(action => action.type === 'location/setLastKnownLocation').length, 1);
  assert.deepEqual(app.calls, ['get-permission', 'get-permission']);
  app.hooks.unmount();
});

test('a first-time permission dialog does not spawn duplicate requests or lose tracking after grant', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const permission = deferred(); let prompts = 0;
  const app = fixture({ requestForegroundPermissionsAsync: () => { prompts++; return permission.promise; } });
  app.state.permission = { status: 'undetermined', canAskAgain: true };
  app.render(); await tick();
  app.setAppState('background'); app.render();
  t.mock.timers.tick(100);
  app.setAppState('active'); app.render();
  const alsoRequested = app.render().requestPermission();
  assert.equal(prompts, 1);
  app.state.permission = { status: 'granted', canAskAgain: true };
  permission.resolve(app.state.permission); await alsoRequested; await tick();
  assert.equal(app.watches.length, 1);
  assert.equal(prompts, 1);
  app.hooks.unmount();
});

test('denied permissions do not reopen on resume; an explicit retry still works when allowed', async () => {
  const app = fixture(); app.state.permission = { status: 'denied', canAskAgain: true };
  app.render(); await tick();
  assert.equal(app.calls.filter(call => call === 'request-permission').length, 1);
  for (let i = 0; i < 5; i++) { app.setAppState('inactive'); app.setAppState('active'); await tick(); }
  assert.equal(app.calls.filter(call => call === 'request-permission').length, 1);
  assert.equal(app.watches.length, 0);
  await app.render().requestPermission();
  assert.equal(app.calls.filter(call => call === 'request-permission').length, 2);
  app.hooks.unmount();
});

test('a permission dialog left open beyond the background timeout still starts one watcher after grant', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const permission = deferred(); let prompts = 0;
  const app = fixture({ requestForegroundPermissionsAsync: () => { prompts++; return permission.promise; } });
  app.state.permission = { status: 'undetermined', canAskAgain: true };
  app.render(); await tick();
  app.setAppState('background'); t.mock.timers.tick(2500);
  app.setAppState('active');
  permission.resolve({ status: 'granted', canAskAgain: true }); await tick();
  assert.equal(app.watches.length, 1);
  assert.equal(app.watches[0].removed, false);
  assert.equal(prompts, 1);
  app.hooks.unmount();
});

test('permanent refusal and disabled GPS never start a watcher or show repeated system dialogs', async () => {
  for (const denied of [true, false]) {
    const app = fixture();
    if (denied) app.state.permission = { status: 'denied', canAskAgain: false };
    else app.state.enabled = false;
    const location = app.render(); await tick();
    assert.equal(await location.getCurrentLocation(), null);
    assert.equal(app.watches.length, 0);
    assert.equal(app.calls.includes('request-permission'), false);
    app.hooks.unmount();
  }
});

test('leaving Home immediately stops tracking and a late permission result cannot stop its newer watcher', async () => {
  const oldPermission = deferred(); let reads = 0;
  const app = fixture({ getForegroundPermissionsAsync: () => ++reads === 1 ? oldPermission.promise : Promise.resolve({ status: 'granted' }) });
  app.render();
  app.props.autoRequest = false; app.render();
  oldPermission.resolve({ status: 'granted' }); await tick();
  assert.equal(app.watches.length, 0);
  app.props.autoRequest = true; app.render(); await tick();
  assert.equal(app.watches.length, 1);
  assert.equal(app.watches[0].removed, false);
  app.props.autoRequest = false; app.render();
  assert.equal(app.watches[0].removed, true);
  app.hooks.unmount();
});

test('a pending native watch from a previous screen is removed without stopping the new session', async () => {
  const pending = deferred(); let starts = 0, oldRemoved = false, newRemoved = false;
  const app = fixture({ watchPositionAsync: async () => ++starts === 1 ? pending.promise : { remove() { newRemoved = true; } } });
  app.render(); await tick();
  app.props.autoRequest = false; app.render();
  app.props.autoRequest = true; app.render(); await tick();
  pending.resolve({ remove() { oldRemoved = true; } }); await tick();
  assert.equal(starts, 2);
  assert.equal(oldRemoved, true);
  assert.equal(newRemoved, false);
  app.hooks.unmount(); assert.equal(newRemoved, true);
});

test('unmount during permission lookup never opens a dialog, writes a location or starts GPS', async () => {
  const permission = deferred();
  const app = fixture({ getForegroundPermissionsAsync: () => permission.promise });
  app.render(); app.hooks.unmount(); const actionCount = app.actions.length;
  permission.resolve({ status: 'undetermined', canAskAgain: true }); await tick();
  assert.equal(app.watches.length, 0);
  assert.equal(app.calls.includes('request-permission'), false);
  assert.equal(app.actions.length, actionCount);
});

test('switching nearby/navigation profiles preserves their accuracy and never retains two native watches', async () => {
  const app = fixture(); app.render(); await tick();
  app.props.trackingProfile = 'navigation'; app.render(); await tick();
  assert.equal(app.watches[0].removed, true);
  assert.equal(app.watches[1].options.accuracy, 'high');
  assert.equal(app.watches[1].options.timeInterval, 5000);
  assert.equal(app.watches[1].options.distanceInterval, 25);
  assert.equal(app.watches.filter(watch => !watch.removed).length, 1);
  app.hooks.unmount();
});

test('manual position in publication/request forms keeps cached, fresh and offline fallback behavior without continuous tracking', async () => {
  for (const cached of [true, false]) {
    const app = fixture({}, { autoRequest: false }); app.state.cached = cached ? fix : null;
    assert.equal(await app.render().getCurrentLocation(), fix);
    assert.equal(app.watches.length, 0);
    assert.equal(app.calls.some(call => call[0] === 'current'), !cached);
    assert.equal(app.calls.includes('request-permission'), false);
    app.hooks.unmount();
  }
  let cachedReads = 0;
  const app = fixture({ getCurrentPositionAsync: async () => { throw new Error('GPS timeout'); },
    getLastKnownPositionAsync: async () => ++cachedReads === 1 ? null : fix }, { autoRequest: false });
  assert.equal(await app.render().getCurrentLocation(), fix);
  assert.equal(cachedReads, 2);
  app.hooks.unmount();
});

test('manual GPS timeout releases the caller and retries share the still-pending native request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred(); let nativeReads = 0;
  const app = fixture({ getCurrentPositionAsync: () => { nativeReads++; return pending.promise; } }, { autoRequest: false });
  app.state.cached = null;
  const api = app.render();
  const first = api.getCurrentLocation();
  assert.equal(api.getCurrentLocation(), first, 'double tap shares the entire request');
  await tick(); t.mock.timers.tick(10_000); await tick();
  assert.equal(await first, null);
  const second = api.getCurrentLocation();
  await tick(); t.mock.timers.tick(10_000); await tick();
  assert.equal(await second, null);
  assert.equal(nativeReads, 1);
  pending.resolve(fix); await tick();
  assert.equal(app.actions.some(action => action.type === 'location/setLastKnownLocation'), false);
  app.hooks.unmount(); assert.equal(app.listeners.size, 0);
});

test('manual GPS timeout preserves the offline cached-position fallback', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cachedReads = 0;
  const app = fixture({ getCurrentPositionAsync: () => new Promise(() => {}),
    getLastKnownPositionAsync: async () => ++cachedReads === 1 ? null : fix }, { autoRequest: false });
  const request = app.render().getCurrentLocation(); await tick();
  t.mock.timers.tick(10_000); await tick();
  assert.equal(await request, fix);
  app.hooks.unmount();
});

test('manual cached reads are also bounded if the native cache never answers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = fixture({ getLastKnownPositionAsync: () => new Promise(() => {}) }, { autoRequest: false });
  const request = app.render().getCurrentLocation(); await tick();
  t.mock.timers.tick(2_000); await tick();
  assert.equal(await request, fix);
  app.hooks.unmount();
});

for (const leave of ['unmount', 'background', 'blur']) test(`manual lookup ignores late GPS after ${leave}`, async () => {
  const pending = deferred();
  const app = fixture({ getCurrentPositionAsync: () => pending.promise });
  app.state.cached = null;
  const api = app.render(); await tick();
  const request = api.getCurrentLocation(); await tick();
  if (leave === 'unmount') app.hooks.unmount();
  else if (leave === 'background') app.setAppState('background');
  else { app.props.autoRequest = false; app.render(); }
  assert.equal(await request, null);
  pending.resolve(fix); await tick();
  assert.equal(app.actions.some(action => action.type === 'location/setLastKnownLocation'), false);
  if (leave !== 'unmount') app.hooks.unmount();
  assert.equal(app.listeners.size, 0);
});
