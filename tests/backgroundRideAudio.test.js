const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture(platform = 'android', overrides = {}) {
  const calls = [];
  const bridge = { startBackgroundAlertSound: async id => calls.push(['start', id]),
    stopBackgroundAlertSound: async id => calls.push(['stop', id]), prepareForegroundAlert: async () => true, ...overrides };
  const load = loader({ 'react-native': { Platform: { OS: platform }, NativeModules: { ZwangaDriverAlerts: bridge } },
    '@notifee/react-native': { __esModule: true, default: { cancelNotification: async (id, tag) => calls.push(['cancel', id, tag]) } },
    './rideAudioDiagnostics': { boundedRideAudio: p => p, reportRideAudioFailure: code => calls.push(['failure', code]) } });
  return { calls, ...load('services/backgroundRideAudio.ts') };
}
test('decision stops the foreground service before cancelling its own notification', async () => {
  const f = fixture(); await f.startBackgroundRideAudio('one');
  await f.cancelRideNotification('one');
  assert.deepEqual(f.calls, [['start', 'one'], ['stop', 'one'], ['cancel', 'one', undefined]]);
});
test('foreground handoff updates the service card without cutting its player during loading', async () => {
  const f = fixture(); assert.equal(await f.prepareForegroundRideAudio('one'), true); assert.deepEqual(f.calls, []);
  const source = fs.readFileSync('services/driverNotifications.ts', 'utf8');
  assert.match(source, /if \(!\(await prepareForegroundRideAudio\(invitationNotificationId\(invitation\)\)\)\) \{\s*await boundedRideAudio\(cancelRideNotification/);
});
test('legacy bridges and iOS never require an Android service or suppress notification cleanup', async () => {
  for (const f of [fixture('ios'), fixture('android', { startBackgroundAlertSound: undefined, stopBackgroundAlertSound: undefined, prepareForegroundAlert: undefined })]) {
    await f.startBackgroundRideAudio('one'); assert.equal(await f.prepareForegroundRideAudio('one'), false);
    await f.cancelRideNotification('one'); assert.deepEqual(f.calls, [['cancel', 'one', undefined]]);
  }
});
test('native failures still permit cancellation, and tagged unrelated notifications never stop a ride service', async () => {
  const f = fixture('android', { stopBackgroundAlertSound: async () => { throw Error('synthetic'); } });
  await f.cancelRideNotification('one');
  assert.deepEqual(f.calls, [['failure', 'BACKGROUND_AUDIO_STOP_UNAVAILABLE'], ['cancel', 'one', undefined]]);
  const tagged = fixture(); await tagged.cancelRideNotification('one', 'other');
  assert.deepEqual(tagged.calls, [['cancel', 'one', 'other']]);
});
test('prebuild declares one private, non-restarting media service and the actual permission', () => {
  const { registerMessagingService } = require('../plugins/withDriverAlertSources');
  const m = { manifest: { $: {}, application: [{ service: [] }], 'uses-permission': [
    { $: { 'android:name': 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'tools:node': 'remove' } },
  ] } };
  registerMessagingService(m); registerMessagingService(m);
  const services = m.manifest.application[0].service.filter(s => s.$['android:name'].endsWith('RideAlertAudioService'));
  assert.equal(services.length, 1); assert.equal(services[0].$['android:exported'], 'false');
  assert.equal(services[0].$['android:foregroundServiceType'], 'mediaPlayback');
  assert.equal(services[0].$['android:stopWithTask'], 'true');
  assert.equal(m.manifest['uses-permission'].find(p => p.$['android:name'].endsWith('MEDIA_PLAYBACK')).$['tools:node'], undefined);
  const java = fs.readFileSync('native/android/notifications/RideAlertAudioService.java', 'utf8');
  assert.ok(java.includes('START_NOT_STICKY') && java.includes('now + 60000'));
  assert.doesNotMatch(java, /setStreamVolume|setInterruptionFilter|CATEGORY_CALL|BOOT_COMPLETED|setSilent\(true\)/);
});
