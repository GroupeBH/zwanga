const test = require('node:test');
const assert = require('node:assert/strict');
const { validateIosCrashlytics, validateIosDidit } = require('../scripts/validate-ios-crashlytics.cjs');
const { ensureCrashlyticsPhase } = require('../plugins/withIosCrashlytics');
const xcode = require('xcode');
const lock = 'PODS:\n  - RNFBCrashlytics (23.8.8):\n  - FirebaseCrashlytics (12.10.0):';
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

test('Didit guard reads installed versions, not external source declarations in a full CocoaPods lock', () => {
  const pkg = { version: '4.9.1', diditNativeSdkVersions: { ios: '4.9.1' } };
  const resolved = 'PODS:\n  - DiditSDK/AutoDetection (4.9.1)\n  - SdkReactNative (4.9.1):\n    - DiditSDK/AutoDetection (= 4.9.1)\n';
  const declarations = '\nDEPENDENCIES:\n  - DiditSDK/AutoDetection (from `https://example.invalid/DiditSDK.podspec`)\n' +
    '  - SdkReactNative (from `../node_modules/@didit-protocol/sdk-react-native`)\n' +
    '\nEXTERNAL SOURCES:\n  SdkReactNative:\n    :path: "../node_modules/@didit-protocol/sdk-react-native"\n' +
    '\nSPEC CHECKSUMS:\n  SdkReactNative: fixture\n\nCOCOAPODS: 1.16.2\n';
  for (const newline of ['\n', '\r\n']) {
    for (const bom of ['', '\uFEFF']) {
      const fullLock = bom + (resolved + declarations).replaceAll('\n', newline);
      assert.deepEqual(validateIosDidit(fullLock, pkg, 'autodetection'), []);
    }
  }
  assert.equal(validateIosDidit(declarations, pkg, 'autodetection').length, 1);
  assert.equal(validateIosDidit(resolved.replaceAll('4.9.1', '4.8.0') + declarations, pkg, 'autodetection').length, 1);
});

test('installed pod checks reject declarations and nested dependency constraints without installed entries', () => {
  const pkg = { version: '4.9.1', diditNativeSdkVersions: { ios: '4.9.1' } };
  const entries = '  - SdkReactNative (4.9.1)\n  - DiditSDK/AutoDetection (4.9.1)\n' +
    '  - RNFBCrashlytics (23.8.8)\n  - FirebaseCrashlytics (12.10.0)\n';
  for (const invalid of [entries, 'DEPENDENCIES:\n' + entries,
    'PODS:\n  - Other (1.0.0)\n\nDEPENDENCIES:\n' + entries,
    'PODS:\n  - Other (1.0.0):\n' + entries.replaceAll('  - ', '    - ')]) {
    assert.equal(validateIosDidit(invalid, pkg, 'autodetection').length, 1);
    assert.equal(validateIosCrashlytics(invalid, phase, '').length, 1);
  }
});

test('Didit guard uses independent bridge/native versions and supports each configured variant', () => {
  const pkg = { version: '4.9.2', diditNativeSdkVersions: { ios: '4.9.1' } };
  for (const [variant, subspec] of Object.entries({ all: 'All', core: 'Core', autodetection: 'AutoDetection', nfc: 'NFC' })) {
    const installed = `PODS:\n  - SdkReactNative (4.9.2):\n  - DiditSDK/${subspec} (4.9.1):\n`;
    assert.deepEqual(validateIosDidit(installed, pkg, variant), []);
    assert.equal(validateIosDidit(installed.replace('4.9.2', '4.8.0'), pkg, variant).length, 1);
    assert.equal(validateIosDidit(installed.replace('4.9.1', '4.8.0'), pkg, variant).length, 1);
  }
});

test('Didit diagnostics identify version mismatches without logging arbitrary lock contents', () => {
  const pkg = { version: '4.9.1', diditNativeSdkVersions: { ios: '4.9.1' } };
  const installed = 'PODS:\n  - SdkReactNative (4.9.0)\n  - DiditSDK/AutoDetection (4.8.0)\n';
  const [error] = validateIosDidit(installed, pkg, 'autodetection');
  assert.match(error, /SdkReactNative installé=4\.9\.0, attendu=4\.9\.1/);
  assert.match(error, /DiditSDK\/AutoDetection installé=4\.8\.0, attendu=4\.9\.1/);
  const [unsafeValue] = validateIosDidit(installed.replace('4.9.0', 'from `https://example.invalid/private`'), pkg, 'autodetection');
  assert.match(unsafeValue, /SdkReactNative installé=absente ou illisible/);
  assert.doesNotMatch(unsafeValue, /example\.invalid|private/);
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
