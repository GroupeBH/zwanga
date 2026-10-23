const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { sourceFiles, sourceDirectory, outputDirectory, registration, registerPackage, installSources } = require('../plugins/withDriverAlertSources');
const { applyBridgeSettings, bridgeSettings } = require('../plugins/withIosBridgeSettings');
const { checkNativeSources } = require('../scripts/check-native-sources.cjs');
const read = file => fs.readFileSync(file, 'utf8');
const freshMain = `class MainApplication {
  override fun getPackages(): List<ReactPackage> = PackageList(this).packages.apply {
    // Manual packages
  }
}`;
const freshPod = `platform :ios, '15.1'
target 'test' do
  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
    )
    unrelated_customization(installer)
  end
end
`;

test('committed Android mirrors and iOS bridge policies match canonical prebuild sources', () => {
  assert.deepEqual(checkNativeSources(), []);
  assert.equal(registerPackage(read('android/app/src/main/java/com/zwanga/MainApplication.kt')), read('android/app/src/main/java/com/zwanga/MainApplication.kt'));
  assert.equal(applyBridgeSettings(read('ios/Podfile')), read('ios/Podfile').replace(/\r\n/g, '\n'));
});

test('a fresh Android directory receives all four classes; registration is idempotent and unrelated code survives', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-native-source-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const android = path.join(temp, 'android');
  installSources(process.cwd(), android); installSources(process.cwd(), android);
  for (const name of sourceFiles) assert.deepEqual(fs.readFileSync(path.join(android, outputDirectory, name)), fs.readFileSync(path.join(sourceDirectory, name)));
  const main = registerPackage(freshMain);
  assert.equal(main.split(registration).length, 2); assert.equal(registerPackage(main), main);
  assert.match(main, /Manual packages/);
  assert.throws(() => registerPackage('unsupported template'), /unsupported/);
  assert.throws(() => registerPackage(freshMain + freshMain), /unsupported/);
  assert.throws(() => registerPackage(main + registration), /unsupported/);
});

test('native configuration registers source copy and package registration on both opt-in and ordinary builds', async () => {
  for (const enabled of [false, true]) {
    const config = require('../plugins/withIncomingRideAlerts')({ name: 'test', slug: 'test' }, { enabled });
    assert.equal(typeof config.mods.android.dangerous, 'function');
    const mod = await config.mods.android.mainApplication({ ...config, modResults: { language: 'kt', contents: freshMain },
      modRequest: { platform: 'android', modName: 'mainApplication', introspect: true } });
    assert(mod.modResults.contents.includes(registration));
  }
});

test('fresh iOS prebuild preserves all bridge fixes without global modular headers or duplicate hooks', () => {
  const result = applyBridgeSettings(freshPod);
  assert(result.includes(bridgeSettings)); assert.equal(applyBridgeSettings(result), result);
  assert.equal(result.replace(`\n\n${bridgeSettings}`, ''), freshPod);
  for (const target of ['react-native-maps', 'react-native-google-maps', 'RNFBApp', 'RNFBAnalytics', 'RNFBCrashlytics', 'RNFBMessaging']) assert(result.includes(target));
  assert.match(result, /DEFINES_MODULE.*'NO'/); assert.match(result, /CLANG_ENABLE_MODULES.*'YES'/);
  assert.doesNotMatch(result, /use_modular_headers!/);
  const floor = require('../plugins/withIosDeploymentTargetFloor').applyIosDeploymentTargetFloor;
  for (const combined of [floor(result), applyBridgeSettings(floor(freshPod))]) {
    assert.equal(applyBridgeSettings(combined), combined); assert.equal(floor(combined), combined);
  }
  assert.match(read('app.plugin.js'), /withIosBridgeSettings/);
  assert.doesNotMatch(read('app.plugin.js'), /withIOSModularHeaders|withReactNativeMapsFix/);
});

test('unsupported or conflicting Podfiles fail explicitly rather than silently reintroducing native compile problems', () => {
  for (const source of ['', freshPod + freshPod, freshPod + '# @generated begin zwanga-ios-bridge-settings',
    freshPod + '\nuse_modular_headers!\n', freshPod + "# CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES"]) {
    assert.throws(() => applyBridgeSettings(source));
  }
});

test('release source parity guard detects missing classes, drift and missing registration without compiling', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-native-parity-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(temp, sourceDirectory), { recursive: true });
  for (const name of sourceFiles) fs.copyFileSync(path.join(sourceDirectory, name), path.join(temp, sourceDirectory, name));
  assert.deepEqual(checkNativeSources(temp), [], 'prebuild has not generated android yet');
  installSources(temp, path.join(temp, 'android'));
  assert(checkNativeSources(temp).some(error => error.includes('registration')));
  fs.writeFileSync(path.join(temp, 'android/app/src/main/java/com/zwanga/MainApplication.kt'), registerPackage(freshMain));
  assert.deepEqual(checkNativeSources(temp), []);
  fs.appendFileSync(path.join(temp, 'android', outputDirectory, sourceFiles[0]), '// drift');
  assert(checkNativeSources(temp).some(error => error.includes(sourceFiles[0])));
});
