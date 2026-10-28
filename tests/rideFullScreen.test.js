const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { configure, isFullScreenBuildEnabled } = require('../plugins/withIncomingRideAlerts');
test('fullscreen capability can be explicitly disabled; manifests are idempotent and reversible', () => {
  const manifest = { application: [{}] };
  configure(manifest, false);
  assert.equal(manifest['uses-permission'].length, 0);
  configure(manifest, true); configure(manifest, true);
  assert.equal(manifest['uses-permission'].length, 1);
  assert.equal(manifest.application[0].activity.length, 1);
  assert.equal(manifest.application[0].activity[0].$['android:exported'], 'false');
  configure(manifest, false); assert.equal(manifest['uses-permission'].length, 0);
});
test('production and local builds include the capability, never automatic driver consent', () => {
  assert.equal(isFullScreenBuildEnabled(undefined), true);
  assert.equal(isFullScreenBuildEnabled('true'), true);
  for (const value of ['false', '', 'TRUE', 'invalid']) assert.equal(isFullScreenBuildEnabled(value), false);
  const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
  assert.equal(eas.build.production.env.ZWANGA_DRIVER_FULL_SCREEN_ENABLED, 'true');
  for (const value of [undefined, 'true', 'false', '', 'invalid']) {
    // Evaluate configuration without local environment, credentials or native side effects.
    const context = { module: { exports: {} }, process: {
      env: { ZWANGA_DRIVER_FULL_SCREEN_ENABLED: value }, cwd: () => '/virtual' }, require: name => {
      if (name === 'dotenv') return { config() {} };
      if (name === 'fs') return { existsSync: () => false };
      if (name === 'path') return path;
      throw Error('Unexpected config dependency: ' + name);
    } };
    vm.runInNewContext(fs.readFileSync('app.config.js', 'utf8'), context);
    const plugin = context.module.exports.expo.plugins.find(p => Array.isArray(p) && p[0] === './plugins/withIncomingRideAlerts');
    assert.equal(plugin[1].enabled, isFullScreenBuildEnabled(value), 'Expo and EAS use the same capability policy');
  }
  const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.ok(manifest.includes('android:name="android.permission.USE_FULL_SCREEN_INTENT"'));
  assert.ok(manifest.includes('android:name="com.zwanga.RIDE_FULL_SCREEN_ENABLED" android:value="true"'));
  const native = fs.readFileSync('native/android/notifications/DriverAlertModule.java', 'utf8');
  assert.ok(native.includes('ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT'));
  assert.ok(native.includes('Uri.parse("package:"'));
  assert.match(native, /getBoolean\([^\n]+false\)/);
  assert.ok(native.includes('canUseFullScreenIntent'));
});

test('native opt-in check failure always preserves notification fallback', async () => {
  for (const canPresent of [undefined, async () => false, async () => { throw new Error('OEM'); }, async () => true]) {
    const module = loader({ 'react-native': { Platform: { OS: 'android' }, NativeModules: {
      ZwangaDriverAlerts: { canPresentFullScreen: canPresent } } },
      './rideAudioDiagnostics': { boundedRideAudio: promise => promise } })('services/rideAlertFullScreen.ts');
    const result = await module.rideAlertFullScreenAction('driver');
    assert.equal(Boolean(result), canPresent !== undefined && await canPresent().catch(() => false));
    if (result) {
      assert.deepEqual(result, { id: 'ride-full-screen', launchActivity: 'com.zwanga.notifications.IncomingRideActivity', mainComponent: 'main' });
      assert.match(fs.readFileSync('android/app/src/main/java/com/zwanga/MainActivity.kt', 'utf8'), /getMainComponentName\(\): String = "main"/);
      assert.match(fs.readFileSync('tests/android/ride-alert-harness/src/main/java/com/zwanga/audit/AuditRuntime.java', 'utf8'), /screen.putString\("mainComponent", "main"\)/);
    }
  }
});

test('a second fullscreen intent binds the new invitation and replaces its expiry callback', () => {
  const source = fs.readFileSync('native/android/notifications/IncomingRideActivity.java', 'utf8');
  assert.match(source, /onNewIntent\(Intent intent\)[\s\S]*?setIntent\(intent\);\s*showInvitation\(\);/);
  assert.match(source, /private void showInvitation\(\)[\s\S]*?handler.removeCallbacks\(refresh\);[\s\S]*?opening = false; summary = null; notificationId = null;/);
});
