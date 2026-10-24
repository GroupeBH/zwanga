const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { configure } = require('../plugins/withIncomingRideAlerts');
test('fullscreen is absent by default, opt-in manifests are idempotent and reversible', () => {
  const manifest = { application: [{}] };
  configure(manifest, false);
  assert.equal(manifest['uses-permission'].length, 0);
  configure(manifest, true); configure(manifest, true);
  assert.equal(manifest['uses-permission'].length, 1);
  assert.equal(manifest.application[0].activity.length, 1);
  assert.equal(manifest.application[0].activity[0].$['android:exported'], 'false');
  configure(manifest, false); assert.equal(manifest['uses-permission'].length, 0);
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
