const test = require('node:test');
const assert = require('node:assert/strict');
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
    if (result) assert.equal(result.launchActivity, 'com.zwanga.notifications.IncomingRideActivity');
  }
});
