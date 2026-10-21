const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('entry telemetry is scrubbed, throttled and never treats ordinary offline/auth errors as crashes', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const events = [];
  const { reportEntryFailure } = loader({ './diagnostics': {
    reportEntryDiagnostic: (...args) => events.push(args),
  } })('services/entryRecovery.ts');
  const scenarios = [
    [{ status: 503, data: 'PRIVATE' }, 'http', true],
    [{ status: 401, data: 'PRIVATE' }, 'http', false],
    [{ status: 'FETCH_ERROR', error: 'PRIVATE' }, 'network', false],
    [{ status: 'FETCH_ERROR', error: 'AbortError: PRIVATE' }, 'aborted', true],
    [{ status: 'TIMEOUT_ERROR', error: 'PRIVATE' }, 'timeout', true],
  ];
  for (const [error, kind, nonfatal] of scenarios) {
    reportEntryFailure('activity', 'read', Date.now() - 20070, error);
    reportEntryFailure('activity', 'read', Date.now(), error);
    await tick();
    assert.equal(events.at(-1)[0], `activity:read:${kind}`);
    assert.equal(events.at(-1)[2], nonfatal);
    assert.equal(JSON.parse(events.at(-1)[1]).elapsedMs, 20070);
    t.mock.timers.tick(60000);
  }
  assert.equal(events.length, scenarios.length);
  reportEntryFailure('PRIVATE', 'read', 0);
  reportEntryFailure('activity', 'PRIVATE', 0); await tick();
  assert.equal(events.length, scenarios.length);
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE/);
});

test('diagnostics is best effort and creates stable nonfatal groups without timestamps in error messages', () => {
  const logs = [], errors = [];
  const reporter = { getCrashlytics: () => ({}), log: (_instance, line) => logs.push(line),
    recordError: (_instance, error) => errors.push(error) };
  const { reportEntryDiagnostic } = loader({ 'expo-constants': {}, 'expo-device': {},
    'react-native': { Platform: { OS: 'android' } }, '@react-native-firebase/crashlytics': reporter,
  })('services/diagnostics.ts');
  reportEntryDiagnostic('activity:read:network', '{"elapsedMs":20}', false);
  reportEntryDiagnostic('activity:timeout:timeout', '{"elapsedMs":25000}', true);
  assert.equal(logs.length, 2); assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'activity:timeout:timeout'); assert.equal(errors[0].name, 'AppEntryError');
  reporter.log = () => { throw Error('native unavailable'); };
  assert.doesNotThrow(() => reportEntryDiagnostic('activity:timeout:timeout', '{}', true));
});
