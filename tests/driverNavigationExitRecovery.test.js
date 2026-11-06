const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture() {
  const h = hookHarness();
  const calls = [], warnings = [], faults = new Set();
  const effect = name => {
    calls.push(name);
    if (faults.has(name)) throw new Error('synthetic cleanup failure');
    if (faults.has(`${name}-async`)) return Promise.reject(new Error('synthetic rejection'));
  };
  const values = {
    tripId: 'audit-trip', isTripOngoing: true, isVoiceGuidanceEnabled: true,
    locationSubscription: { current: null },
    backgroundDisclosureResolverRef: { current: null },
    recalcRouteTimeoutRef: { current: null },
    isExitingRef: { current: false },
    router: { replace: route => calls.push(['navigate', route]) },
    navigateAfterRelease: (navigate, recover) => {
      effect('release-map'); values.recover = recover;
      if (faults.has('not-scheduled')) return false;
      navigate(); return true;
    },
    cancelRouteRequest: () => effect('cancel-route'),
    cancelLocationRequest: () => effect('cancel-location'),
    stopDriverMarkerAnimation: () => effect('stop-animation'),
  };
  const props = new Proxy(values, { get(target, key) {
    if (!(key in target)) target[key] = String(key).endsWith('Ref') ? { current: new Set() } : () => {};
    return target[key];
  } });
  const hook = loader({ react: h.react, 'expo-location': {},
    '@/utils/throttledWarning': { warnThrottled: message => warnings.push(message) },
    '@/utils/navigationSpeech': { NavigationSpeech: { stop: () => effect('stop-speech') } },
  })('hooks/driver-navigation/useDriverNavigationExit.ts').useDriverNavigationExit;
  const current = h.render(() => hook(props));
  calls.length = 0;
  values.locationSubscription.current = { remove: () => {
    assert.equal(values.locationSubscription.current, null, 'detach before native teardown');
    return effect('remove-gps');
  } };
  values.backgroundDisclosureResolverRef.current = accepted => {
    assert.equal(accepted, false);
    assert.equal(values.backgroundDisclosureResolverRef.current, null);
    return effect('disclosure');
  };
  return { current, values, calls, faults, warnings, unmount: () => h.unmount() };
}

for (const [action, route] of [['navigateBackSafely', '/trip/manage/audit-trip'], ['navigateHomeSafely', '/(tabs)']]) {
  test(`${action}: cleanup, map release and destination are preserved; rapid taps do not navigate twice`, t => {
    const f = fixture(); t.after(f.unmount);
    f.current[action](); f.current[action]();
    assert.deepEqual(f.calls.filter(Array.isArray), [['navigate', route]]);
    assert.ok(f.calls.indexOf('remove-gps') < f.calls.indexOf('release-map'));
    assert.ok(f.calls.indexOf('stop-speech') < f.calls.indexOf('release-map'));
    assert.equal(f.warnings.length, 0);
  });

  test(`${action}: every cleanup failure is isolated and cannot prevent navigation`, t => {
    const f = fixture(); t.after(f.unmount);
    for (const name of ['cancel-route', 'cancel-location', 'stop-animation', 'remove-gps', 'disclosure', 'stop-speech']) f.faults.add(name);
    assert.doesNotThrow(() => f.current[action]());
    assert.deepEqual(f.calls.filter(Array.isArray), [['navigate', route]]);
    assert.equal(f.warnings.length, 6);
    assert.equal(f.values.locationSubscription.current, null);
    assert.equal(f.values.backgroundDisclosureResolverRef.current, null);
    f.values.recover();
    f.current[action]();
    assert.equal(f.calls.filter(name => name === 'remove-gps').length, 1, 'failed handle never reused');
    assert.equal(f.calls.filter(Array.isArray).length, 2, 'map recovery permits another exit');
  });

  for (const failure of ['release-map', 'not-scheduled']) {
    test(`${action}: ${failure} failure releases the exit latch for retry`, t => {
      const f = fixture(); t.after(f.unmount);
      f.faults.add(failure);
      assert.doesNotThrow(() => f.current[action]());
      assert.equal(f.values.isExitingRef.current, false);
      assert.equal(f.calls.filter(Array.isArray).length, 0);
      f.faults.clear(); f.current[action]();
      assert.deepEqual(f.calls.filter(Array.isArray), [['navigate', route]]);
    });
  }
}

test('async cleanup rejection is consumed without waiting for it to leave the screen', async t => {
  const f = fixture(); t.after(f.unmount);
  f.faults.add('stop-speech-async');
  f.faults.add('remove-gps-async');
  f.current.navigateHomeSafely();
  assert.deepEqual(f.calls.filter(Array.isArray), [['navigate', '/(tabs)']]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.warnings.length, 2);
});

test('unmount continues through failing native cleanup and clears the route timer', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  let fired = false;
  f.values.recalcRouteTimeoutRef.current = setTimeout(() => { fired = true; }, 100);
  f.faults.add('remove-gps');
  assert.doesNotThrow(f.unmount);
  t.mock.timers.tick(200);
  assert.equal(fired, false);
  assert.equal(f.values.recalcRouteTimeoutRef.current, null);
  assert.equal(f.values.isMountedRef.current, false);
  assert.ok(f.calls.includes('disclosure'));
  assert.ok(f.calls.includes('stop-speech'));
});

test('UI cleanup finishes even if GPS teardown fails, without initiating navigation', t => {
  const f = fixture(); t.after(f.unmount);
  f.faults.add('remove-gps');
  assert.doesNotThrow(f.current.cleanupNavigationUi);
  assert.equal(f.values.locationSubscription.current, null);
  assert.equal(f.values.tripEndNoticeRef.current, null);
  assert.equal(f.calls.filter(Array.isArray).length, 0);
});
