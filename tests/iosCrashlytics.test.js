const test = require('node:test');
const assert = require('node:assert/strict');
const { validateIosCrashlytics, validateIosDidit } = require('../scripts/validate-ios-crashlytics.cjs');
const { ensureCrashlyticsPhase } = require('../plugins/withIosCrashlytics');
const xcode = require('xcode');
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

test('iOS guard also rejects a missing, outdated or wrong-variant Didit native SDK', () => {
  const pkg = { version: '4.9.1', diditNativeSdkVersions: { ios: '4.9.1' } };
  const lock = 'PODS:\n  - SdkReactNative (4.9.1):\n  - DiditSDK/AutoDetection (4.9.1):';
  assert.deepEqual(validateIosDidit(lock, pkg, 'autodetection'), []);
  for (const stale of ['', lock.replaceAll('4.9.1', '4.8.0'), lock.replace('AutoDetection', 'Core'),
    lock.replace('SdkReactNative', 'Other'), lock.replace('DiditSDK', 'Other')]) {
    assert.equal(validateIosDidit(stale, pkg, 'autodetection').length, 1);
  }
  assert.equal(validateIosDidit(lock, {}, 'autodetection').length, 1);
  assert.equal(validateIosDidit(lock, pkg, 'invalid').length, 1);
});

test('native iOS project and regenerated prebuild retain one Crashlytics phase attached to the app', () => {
  const project = xcode.project('ios/zwanga.xcodeproj/project.pbxproj'); project.parseSync();
  const target = project.getFirstTarget().firstTarget;
  const phases = project.hash.project.objects.PBXShellScriptBuildPhase;
  const crashPhases = () => target.buildPhases.filter(({ value }) => phases[value]?.name?.includes('[RNFB] Crashlytics Configuration'));
  assert.equal(crashPhases().length, 1);
  ensureCrashlyticsPhase(project); assert.equal(crashPhases().length, 1);
  const id = crashPhases()[0].value;
  target.buildPhases = target.buildPhases.filter(({ value }) => value !== id);
  delete phases[id]; delete phases[`${id}_comment`];
  ensureCrashlyticsPhase(project); ensureCrashlyticsPhase(project);
  assert.equal(crashPhases().length, 1);
  const phase = phases[crashPhases()[0].value];
  assert.match(phase.shellScript, /crashlytics\/ios_config\.sh/);
  assert(phase.inputPaths.some(path => path.includes('DWARF_DSYM')));
  assert.match(require('node:fs').readFileSync('app.plugin.js', 'utf8'), /withIosCrashlytics/);
});
