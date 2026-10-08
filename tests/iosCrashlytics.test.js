const test = require('node:test');
const assert = require('node:assert/strict');
const { validateIosCrashlytics } = require('../scripts/validate-ios-crashlytics.cjs');
const lock = '  - RNFBCrashlytics (23.8.8):\n  - FirebaseCrashlytics (12.10.0):';
const phase = 'name = "[RNFB] Crashlytics Configuration"; shellScript = "${PODS_ROOT}/FirebaseCrashlytics/run";';
test('iOS build guard requires installed pods AND the native symbol-upload phase', () => {
  assert.deepEqual(validateIosCrashlytics(lock, phase, ''), []);
  assert.deepEqual(validateIosCrashlytics(lock, '', phase), []);
  assert.equal(validateIosCrashlytics('', phase, '').length, 1);
  assert.equal(validateIosCrashlytics(lock, '', '').length, 1);
  assert.equal(validateIosCrashlytics('', '', '').length, 2);
  assert.equal(validateIosCrashlytics(lock, '[RNFB] Crashlytics Configuration', '').length, 1);
});
test('EAS validates the iOS native integration after CocoaPods installation', () => {
  assert.match(require('../package.json').scripts['eas-build-post-install'], /validate-ios-crashlytics\.cjs --eas/);
});
