const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loader } = require('./helpers/loadTypeScript.cjs');

test('missing development/test/staging API never falls back to production, release remains compatible', () => {
  const { apiDestination, PRODUCTION_API_URL, UNCONFIGURED_API_URL } = loader()('config/apiDestination.ts');
  for (const env of ['development', 'test', 'staging', 'production', undefined]) {
    assert.equal(apiDestination(undefined, true, env), UNCONFIGURED_API_URL);
    assert.equal(apiDestination('  http://127.0.0.1:5200/api/v1  ', true, env), 'http://127.0.0.1:5200/api/v1');
  }
  for (const env of ['test', 'staging', 'development']) assert.equal(apiDestination('', false, env), UNCONFIGURED_API_URL);
  assert.equal(apiDestination(undefined, false, 'production'), PRODUCTION_API_URL);
});

test('integration gate requires explicit disposable binaries and fails immediately, never silently skips', () => {
  const { runIntegration, suites } = require('../scripts/check-integration.cjs');
  const calls = [];
  const run = (_node, args) => { calls.push(args); return { status: 0 }; };
  assert.equal(runIntegration(run, {}), 1); assert.equal(calls.length, 0);
  const env = { AUDIT_POSTGRES_BIN: path.resolve('synthetic-pg-bin') };
  assert.equal(runIntegration(run, env, () => false), 1); assert.equal(calls.length, 0);
  assert.equal(runIntegration(run, env, () => true), 0);
  assert.equal(calls.length, 4); assert.deepEqual(calls.slice(0, 3).map(args => args.at(-1)), suites);
  assert.deepEqual(calls[3], [path.join('scripts', 'test-auth-local.cjs'), env.AUDIT_POSTGRES_BIN]);
  for (const result of [{ status: 1 }, { status: null, signal: 'SIGTERM' }, { error: Error('test') }]) {
    let attempts = 0;
    assert.equal(runIntegration(() => { attempts++; return result; }, env, () => true), 1);
    assert.equal(attempts, 1);
  }
});

test('text and inputs support 200 percent without removing other defaults', () => {
  const Text = { defaultProps: { selectable: true } }, TextInput = { defaultProps: { autoCorrect: false } };
  loader({ 'react-native': { Text, TextInput } })('utils/configureFontScaling.ts').configureFontScaling();
  assert.equal(Text.defaultProps.maxFontSizeMultiplier, 2);
  assert.equal(TextInput.defaultProps.maxFontSizeMultiplier, 2);
  assert.equal(Text.defaultProps.selectable, true); assert.equal(TextInput.defaultProps.autoCorrect, false);
});

test('location access signal has a stable primitive snapshot and releases subscriptions', () => {
  const signal = loader()('services/locationAccessSignal.ts');
  let notified = 0; const stop = signal.subscribeLocationAccess(() => notified++);
  const previous = signal.getLocationAccessRevision();
  assert.equal(previous, signal.getLocationAccessRevision());
  signal.notifyLocationAccessChanged(); assert.equal(notified, 1);
  assert.equal(signal.getLocationAccessRevision(), previous + 1);
  stop(); signal.notifyLocationAccessChanged(); assert.equal(notified, 1);
});
