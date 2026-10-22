const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { AndroidConfig } = require('@expo/config-plugins');
const { configureRideAlertBuild } = require('../scripts/configure-ride-alert-build.cjs');

test('test profile opts into both transports without changing production or dev defaults', () => {
  const { build } = require('../eas.json');
  const profile = build['ride-alerts-test'];
  assert.equal(profile.extends, 'production');
  assert.equal(profile.env.ZWANGA_DRIVER_FULL_SCREEN_ENABLED, 'true');
  assert.equal(profile.env.EXPO_PUBLIC_IOS_FCM_ENABLED, 'true');
  for (const name of ['production', 'dev', 'dev-device']) {
    assert.notEqual(build[name].env?.ZWANGA_DRIVER_FULL_SCREEN_ENABLED, 'true');
    assert.notEqual(build[name].env?.EXPO_PUBLIC_IOS_FCM_ENABLED, 'true');
  }
  assert.match(require('../package.json').scripts['eas-build-post-install'], /^node .\/scripts\/configure-ride-alert-build.cjs --eas &&/);
});

test('EAS hook really enables the checked-in Android manifest, preserves other entries and is reversible', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zwanga-alert-build-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const filename = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><uses-permission android:name="android.permission.INTERNET"/><application android:label="Fixture"><meta-data android:name="untouched" android:value="value"/><activity android:name=".MainActivity"/></application></manifest>');
  const logs = [];
  const env = { EAS_BUILD_PLATFORM: 'android', ZWANGA_DRIVER_FULL_SCREEN_ENABLED: 'true' };
  const run = () => configureRideAlertBuild({ root, env, eas: true, log: line => logs.push(line) });
  await run(); await run();
  let manifest = (await AndroidConfig.Manifest.readAndroidManifestAsync(filename)).manifest;
  const permissions = manifest['uses-permission'].map(item => item.$['android:name']);
  assert.deepEqual(permissions, ['android.permission.INTERNET', 'android.permission.USE_FULL_SCREEN_INTENT']);
  assert.equal(manifest.application[0].activity.length, 2);
  assert.equal(manifest.application[0]['meta-data'].find(item => item.$['android:name'] === 'com.zwanga.RIDE_FULL_SCREEN_ENABLED').$['android:value'], 'true');
  assert.equal(manifest.application[0]['meta-data'].find(item => item.$['android:name'] === 'untouched').$['android:value'], 'value');
  const content = await fs.readFile(filename, 'utf8');
  await run(); assert.equal(await fs.readFile(filename, 'utf8'), content);
  delete env.ZWANGA_DRIVER_FULL_SCREEN_ENABLED; await run();
  manifest = (await AndroidConfig.Manifest.readAndroidManifestAsync(filename)).manifest;
  assert.deepEqual(manifest['uses-permission'].map(item => item.$['android:name']), ['android.permission.INTERNET']);
  assert.equal(manifest.application[0]['meta-data'].find(item => item.$['android:name'] === 'com.zwanga.RIDE_FULL_SCREEN_ENABLED').$['android:value'], 'false');
  assert.ok(logs.every(line => !line.includes('untouched') && !line.includes(root)));
});

test('iOS activation does not require or mutate Android and unknown EAS platforms fail closed', async () => {
  const logs = [];
  await configureRideAlertBuild({ root: 'not-an-android-project', eas: true,
    env: { EAS_BUILD_PLATFORM: 'ios', EXPO_PUBLIC_IOS_FCM_ENABLED: 'true' }, log: line => logs.push(line) });
  assert.match(logs[0], /activé/);
  for (const platform of [undefined, 'web']) {
    await assert.rejects(configureRideAlertBuild({ eas: true, env: { EAS_BUILD_PLATFORM: platform } }), /Plateforme EAS absente/);
  }
});
