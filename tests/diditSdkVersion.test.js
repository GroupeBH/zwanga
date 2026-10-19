const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TypeScriptParser } = require('@react-native/codegen/lib/parsers/typescript/parser');
const { loader } = require('./helpers/loadTypeScript.cjs');

const packageName = '@didit-protocol/sdk-react-native';
const sdkRoot = `node_modules/${packageName}`;
const read = filename => fs.readFileSync(filename, 'utf8');
const sdk = require(`${packageName}/package.json`);

function diditPluginOptions() {
  // Inspect only public configuration, without loading .env or any credentials.
  const sandbox = { module: { exports: {} }, process: { env: {}, cwd: () => '/virtual' },
    require: name => {
      if (name === 'dotenv') return { config() {} };
      if (name === 'fs') return { existsSync: () => false };
      if (name === 'path') return path;
      throw new Error('Unexpected configuration dependency: ' + name);
    } };
  vm.runInNewContext(read('app.config.js'), sandbox);
  return sandbox.module.exports.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === packageName)[1];
}

test('Didit npm manifest, lock and installed SDK agree on one exact version', () => {
  const manifest = require('../package.json');
  const lock = require('../package-lock.json');
  const version = manifest.dependencies[packageName];
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(sdk.version, version);
  assert.equal(lock.packages[''].dependencies[packageName], version);
  assert.equal(lock.packages[sdkRoot].version, version);
  assert.equal(lock.packages[sdkRoot].resolved, `https://registry.npmjs.org/${packageName}/-/sdk-react-native-${version}.tgz`);
  assert.match(lock.packages[sdkRoot].integrity, /^sha512-/);
});

test('native version pins agree with Didit metadata and retain automatic capture without NFC', () => {
  const versions = sdk.diditNativeSdkVersions;
  const podfile = read('ios/Podfile');
  const podspecUrl = `https://raw.githubusercontent.com/didit-protocol/sdk-ios/${versions.ios}/DiditSDK.podspec`;
  assert.equal(podfile.split(podspecUrl).length - 1, 1);
  assert.match(podfile, /\$DiditSdkIosLinkage = 'cocoapods'/);
  assert.equal(JSON.parse(read('ios/Podfile.properties.json'))['didit.iosVariant'], 'autodetection');
  assert.match(read('android/gradle.properties'), /^diditSdkAndroidVariant=autodetection\s*$/m);
  assert.ok(read(`${sdkRoot}/android/build.gradle`).includes(`implementation "me.didit:$diditSdkAndroidArtifact:${versions.android}"`));
  assert.match(read('android/build.gradle'), /content \{ includeGroup "me.didit" \}/);
  assert.match(read('android/app/build.gradle'), /exclude group: 'org.bouncycastle', module: 'bcprov-jdk15to18'/);
  assert.match(read('android/app/build.gradle'), /META-INF\/versions\/9\/OSGI-INF\/MANIFEST\.MF/);
  const options = diditPluginOptions();
  assert.equal(options.iosVariant, 'autodetection');
  assert.equal(options.androidVariant, 'autodetection');
  assert.equal(options.iosPodspecUrl, undefined, 'prebuild must use the installed SDK pin');
});

test('the installed Expo plugin preserves native settings and regenerates one matching iOS pod', async () => {
  const plugin = require(`${packageName}/app.plugin.js`);
  const config = plugin({ name: 'test', slug: 'test' }, diditPluginOptions());
  const apply = (platform, modName, modResults) => config.mods[platform][modName]({ ...config, modResults,
    modRequest: { platform, modName, introspect: true } });
  const source = read('ios/Podfile');
  const result = (await apply('ios', 'podfile', { contents: source })).modResults.contents;
  assert.match(result, new RegExp(`/sdk-ios/${sdk.diditNativeSdkVersions.ios.replaceAll('.', '\\.')}/DiditSDK\\.podspec`));
  assert.equal((result.match(/pod didit_sdk_subspec/g) || []).length, 1);
  assert.match(result, /CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES/);
  assert.match(result, /zwanga-ios-deployment-target-floor/);
  assert.equal((await apply('ios', 'podfile', { contents: result })).modResults.contents, result);
  const android = read('android/app/build.gradle');
  assert.equal((await apply('android', 'appBuildGradle', { contents: android, language: 'groovy' })).modResults.contents, android);
  const properties = (await apply('ios', 'podfileProperties', { 'ios.deploymentTarget': '15.1' })).modResults;
  assert.equal(properties['didit.iosVariant'], 'autodetection');
  assert.equal(properties['ios.deploymentTarget'], '15.1');
});

test('the installed React Native codegen parses the updated Didit TurboModule', () => {
  const filename = `${sdkRoot}/src/NativeSdkReactNative.ts`;
  const schema = new TypeScriptParser().parseString(read(filename), filename);
  const module = Object.values(schema.modules).find(value => value.moduleName === 'SdkReactNative');
  assert.ok(module, 'Didit must remain a supported native module');
  assert.ok(module.spec.methods.some(method => method.name === 'startVerification'));
});

test('Zwanga options reach the installed Didit JS bridge and its native result remains compatible', async () => {
  const calls = [];
  const load = loader({ './NativeSdkReactNative': { startVerification: async (token, config) => {
    calls.push({ token, config });
    return { type: 'completed', sessionId: 'synthetic-session', status: 'Pending' };
  } } });
  const bridge = load(`${sdkRoot}/src/index.tsx`);
  const app = loader({ [packageName]: bridge })('features/identity/diditSdk.ts');
  const result = await app.runDiditNativeVerification('synthetic-token');
  assert.deepEqual(result, { type: 'completed', session: { sessionId: 'synthetic-session', status: 'Pending' } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].token, 'synthetic-token');
  assert.equal(calls[0].config.languageCode, 'fr');
  assert.equal(calls[0].config.loggingEnabled, false);
  assert.equal(calls[0].config.defaultDocumentCamera, 'back');
  assert.equal(calls[0].config.defaultLivenessCamera, 'front');
  assert.equal(calls[0].config.showDocumentCameraSwitchButton, true);
  assert.equal(calls[0].config.showLivenessCameraSwitchButton, false);
  assert.equal(calls[0].config.showCloseButton, true);
  assert.equal(calls[0].config.showExitConfirmation, true);
  assert.equal(calls[0].config.closeOnComplete, false);
});
