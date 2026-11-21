const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { AndroidConfig } = require('@expo/config-plugins');
const plugin = require('../plugins/withUnusedExpoAudioServicesRemoved');
const { unusedAudioServices, removeUnusedExpoAudioServices } = plugin;
const { registerMessagingService } = require('../plugins/withDriverAlertSources');
const permission = name => ({ $: { 'android:name': 'android.permission.' + name } });
const fixture = () => ({ manifest: { $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
  'uses-permission': ['RECEIVE_BOOT_COMPLETED', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION',
    'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'RECORD_AUDIO'].map(permission),
  application: [{ $: { 'android:name': '.MainApplication' },
    receiver: [{ $: { 'android:name': 'expo.modules.taskManager.TaskBroadcastReceiver' },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } }] }] }],
    service: [
      { $: { 'android:name': 'expo.modules.location.services.LocationTaskService', 'android:foregroundServiceType': 'location' } },
      { $: { 'android:name': 'app.notifee.core.ForegroundService', 'android:foregroundServiceType': 'mediaPlayback' } },
      ...unusedAudioServices.map(name => ({ $: { 'android:name': name, 'android:exported': 'false' },
        'intent-filter': [{ action: [{ $: { 'android:name': 'androidx.media3.session.MediaSessionService' } }] }] })),
    ],
  }],
} });
const removals = manifest => manifest.manifest.application[0].service.filter(s => unusedAudioServices.includes(s.$['android:name']));
function assertPolicy(manifest) {
  assert.deepEqual(removals(manifest), unusedAudioServices.map(name => ({ $: { 'android:name': name, 'tools:node': 'remove' } })));
}

test('remove only the unused Expo services; preserve boot receivers, GPS, microphone permission and Notifee', () => {
  const original = fixture(), result = removeUnusedExpoAudioServices(structuredClone(original));
  assertPolicy(result);
  assert.deepEqual(result.manifest['uses-permission'], original.manifest['uses-permission']);
  assert.deepEqual(result.manifest.application[0].receiver, original.manifest.application[0].receiver);
  assert.deepEqual(result.manifest.application[0].service.slice(0, 2), original.manifest.application[0].service.slice(0, 2));
  assert.equal(result.manifest.$['xmlns:tools'], 'http://schemas.android.com/tools');
  assert.deepEqual(removeUnusedExpoAudioServices(structuredClone(result)), result);
});

test('fresh prebuild and either plugin order retain the bounded Zwanga ringtone and its permission', async () => {
  const minimal = { manifest: { application: [{}] } };
  assertPolicy(removeUnusedExpoAudioServices(minimal));
  assert.throws(() => removeUnusedExpoAudioServices({ manifest: {} }), /main Android application/);
  for (const order of [
    value => registerMessagingService(removeUnusedExpoAudioServices(value)),
    value => removeUnusedExpoAudioServices(registerMessagingService(value)),
  ]) {
    const result = order(fixture()); assertPolicy(result);
    assert.equal(result.manifest.application[0].service.find(s => s.$['android:name'] ===
      'com.zwanga.notifications.RideAlertAudioService').$['android:foregroundServiceType'], 'mediaPlayback');
    assert.ok(result.manifest['uses-permission'].some(p => p.$['android:name'] ===
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK' && !p.$['tools:node']));
  }
  const config = plugin({ name: 'Audio policy test', slug: 'audio-policy-test' });
  const mod = await config.mods.android.manifest({ ...config, modResults: fixture(),
    modRequest: { platform: 'android', modName: 'manifest', introspect: true } });
  assertPolicy(mod.modResults);
  assert.match(fs.readFileSync('app.plugin.js', 'utf8'), /require\('\.\/plugins\/withUnusedExpoAudioServicesRemoved'\)\(config\)/);
  assert.match(fs.readFileSync('app.config.js', 'utf8'), /['"]\.\/app\.plugin\.js['"]/);
});

test('checked-in native manifest mirrors the prebuild policy; library services are actually present in installed Expo', async () => {
  const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync('android/app/src/main/AndroidManifest.xml');
  assertPolicy(manifest);
  assert.equal(manifest.manifest.$['xmlns:tools'], 'http://schemas.android.com/tools');
  // Compare only these components: a failure must never dump manifest API keys.
  assert.deepEqual(removals(removeUnusedExpoAudioServices(structuredClone(manifest))), removals(manifest));
  const library = await AndroidConfig.Manifest.readAndroidManifestAsync('node_modules/expo-audio/android/src/main/AndroidManifest.xml');
  for (const name of unusedAudioServices) {
    assert.ok(library.manifest.application[0].service.some(s =>
      ['.' + name.slice('expo.modules.audio.'.length), name].includes(s.$['android:name'])));
  }
});

test('foreground Expo playback remains iOS-only; Android uses the native player or legacy notification', () => {
  const source = fs.readFileSync('services/foregroundRideSound.ts', 'utf8');
  assert.match(source, /Platform\.OS === 'android'/);
  assert.match(source, /bridge\.startForegroundSound/);
  assert.match(source, /legacyRideSound/);
  assert.match(source, /shouldPlayInBackground: false/);
  assert.doesNotMatch(source, /setActiveForLockScreen|useAudioRecorder|AudioRecorder/);
});
