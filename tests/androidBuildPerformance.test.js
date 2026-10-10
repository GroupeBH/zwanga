const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { AndroidConfig } = require('@expo/config-plugins');
const withPatchedReactAndroid = require('../plugins/withPatchedReactAndroid');
const { applyBuildPerformanceProperties } = withPatchedReactAndroid;

const read = filename => fs.readFileSync(filename, 'utf8');
const property = (key, value) => ({ type: 'property', key, value });

test('enables task caching and skips optional PNG recompression on a fresh prebuild', () => {
  assert.deepEqual(applyBuildPerformanceProperties([]), [
    property('org.gradle.caching', 'true'),
    property('android.enablePngCrunchInReleaseBuilds', 'false'),
  ]);
});

test('property updates are idempotent, remove duplicates and preserve unrelated settings', () => {
  const original = [
    { type: 'comment', value: 'Local settings' },
    property('reactNativeArchitectures', 'armeabi-v7a,arm64-v8a,x86,x86_64'),
    property('org.gradle.caching', 'false'),
    property('org.gradle.jvmargs', '-Xmx2048m'),
    property('org.gradle.caching', 'false'),
    property('hermesEnabled', 'true'),
    property('android.enablePngCrunchInReleaseBuilds', 'true'),
    property('newArchEnabled', 'true'),
    property('custom.setting', 'keep'),
  ];
  const snapshot = JSON.stringify(original);
  const result = applyBuildPerformanceProperties(original);
  assert.equal(JSON.stringify(original), snapshot, 'must not mutate the input');
  assert.deepEqual(applyBuildPerformanceProperties(result), result);
  const managed = new Set(['org.gradle.caching', 'android.enablePngCrunchInReleaseBuilds']);
  assert.deepEqual(result.filter(item => !managed.has(item.key)), original.filter(item => !managed.has(item.key)));
  assert.deepEqual(result.filter(item => item.key === 'org.gradle.caching'), [property('org.gradle.caching', 'true')]);
  assert.deepEqual(result.filter(item => item.key === 'android.enablePngCrunchInReleaseBuilds'), [
    property('android.enablePngCrunchInReleaseBuilds', 'false'),
  ]);
});

test('committed native settings already match prebuild and keep all supported architectures', () => {
  const parsed = AndroidConfig.Properties.parsePropertiesFile(read('android/gradle.properties'));
  assert.deepEqual(applyBuildPerformanceProperties(parsed), parsed);
  const values = Object.fromEntries(parsed.filter(item => item.type === 'property').map(item => [item.key, item.value]));
  assert.equal(values.reactNativeArchitectures, 'armeabi-v7a,arm64-v8a,x86,x86_64');
  assert.equal(values.hermesEnabled, 'true');
  assert.equal(values.newArchEnabled, 'true');
  assert.equal(values['org.gradle.parallel'], 'true');
  assert.match(read('android/app/build.gradle'), /crunchPngs enablePngCrunchInRelease\.toBoolean\(\)/);
});

test('the existing native plugin registers cache properties alongside source and artifact guards', async () => {
  const config = withPatchedReactAndroid({ name: 'test', slug: 'test' });
  assert.equal(typeof config.mods.android.settingsGradle, 'function');
  assert.equal(typeof config.mods.android.appBuildGradle, 'function');
  assert.equal(typeof config.mods.android.gradleProperties, 'function');
  const result = await config.mods.android.gradleProperties({
    ...config,
    modResults: [],
    modRequest: { platform: 'android', modName: 'gradleProperties', introspect: true },
  });
  assert.deepEqual(result.modResults, applyBuildPerformanceProperties([]));
  assert.match(read('app.plugin.js'), /withPatchedReactAndroid/);
});

test('production Android caches computations without changing the runner tier or release tasks', () => {
  const { build } = JSON.parse(read('eas.json'));
  const production = build.production;
  assert.equal(production.android.image, 'ubuntu-24.04-jdk-17-ndk-r27b');
  assert.equal(production.android.env.EAS_USE_CACHE, '1');
  assert.deepEqual(production.android.cache, {
    key: 'android-sdk54-gradle-v1',
    paths: ['/home/expo/.gradle/caches/build-cache-1'],
  });
  assert.equal(production.resourceClass, undefined);
  assert.equal(production.android.resourceClass, undefined);
  assert.equal(production.android.gradleCommand, undefined);
  assert.equal(production.android.buildType, 'app-bundle');
  assert.equal(production.distribution, 'store');
  assert.equal(production.autoIncrement, true);
  assert.equal(production.env.EAS_USE_CACHE, undefined, 'cache must remain Android-only');
  assert.equal(production.cache, undefined);
  assert.deepEqual(production.ios, { image: 'latest', simulator: false });
  assert.equal(build.dev.android.image, 'latest');
  assert.equal(build.dev.developmentClient, true);
  assert.equal(build['dev-device'].extends, 'dev');
  assert.equal(build['dev-device'].android.buildType, 'apk');
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.match(scripts.postinstall, /patch-react-native-drawing-order\.js/);
  assert.match(scripts['eas-build-on-success'], /validate-android-native\.cjs --eas/);
});
