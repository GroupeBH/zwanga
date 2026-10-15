const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture(crashModule) {
  const load = loader({
    'expo-constants': { nativeBuildVersion: 'synthetic-build', expoConfig: { version: 'synthetic-version' } },
    'expo-device': { modelName: 'synthetic-model' },
    'react-native': { Platform: { OS: 'android', Version: 35 } },
    '@react-native-firebase/crashlytics': crashModule,
  });
  return { diagnostics: load('services/diagnostics.ts'), startup: load('services/startupDiagnostics.ts') };
}

test('local auth failures are reported automatically once per phase, without credentials or arbitrary errors', () => {
  const errors = [], logs = [], attributes = [];
  const { diagnostics, startup } = fixture({
    getCrashlytics: () => ({}), setAttributes: async (_reporter, values) => attributes.push(values),
    setAttribute: async () => {}, log: (_reporter, message) => logs.push(message),
    recordError: (_reporter, error) => errors.push(error.message),
  });
  startup.recordStartupMilestone('session_save_failed');
  diagnostics.initializeDiagnostics();
  startup.recordStartupMilestone('session_save_failed');
  startup.recordStartupMilestone('restore_failed');
  startup.recordStartupMilestone('restore_failed');
  startup.recordStartupMilestone('login_request_failed');
  diagnostics.initializeDiagnostics();
  startup.recordStartupMilestone('session_save_failed');
  assert.deepEqual(errors, ['AuthSession:session_save_failed', 'AuthSession:restore_failed']);
  assert.equal(attributes[0].app_build, 'synthetic-build');
  assert.ok(logs.every(value => /^startup:[a-z_]+:\d+ms$/.test(value)));
});

test('missing or failing native reporting cannot turn a handled login error into an exception', () => {
  for (const reporter of [
    { getCrashlytics() { throw new Error('absent'); } },
    { getCrashlytics: () => ({}), setAttributes: async () => {}, setAttribute: async () => {},
      log() {}, recordError() { throw new Error('reporter unavailable'); } },
  ]) {
    const { diagnostics, startup } = fixture(reporter);
    assert.doesNotThrow(() => diagnostics.initializeDiagnostics());
    assert.doesNotThrow(() => startup.recordStartupMilestone('session_save_failed'));
  }
});
