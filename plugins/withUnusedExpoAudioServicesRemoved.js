const { withAndroidManifest } = require('@expo/config-plugins');

// expo-audio 1.1.x declares both services even when the app only uses its
// foreground iOS player. Android rings use Zwanga's own bounded alert service.
// Do not remove BOOT_COMPLETED receivers or shared foreground-service permissions:
// notifications, location and the native ride ringtone still depend on them.
const unusedAudioServices = [
  'expo.modules.audio.service.AudioControlsService',
  'expo.modules.audio.service.AudioRecordingService',
];

function removeUnusedExpoAudioServices(androidManifest) {
  const manifest = androidManifest.manifest;
  const application = manifest?.application?.[0];
  if (!application) throw new Error('Expo audio policy requires the main Android application manifest.');
  manifest.$ = { ...manifest.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
  application.service = (application.service || []).filter(
    service => !unusedAudioServices.includes(service.$?.['android:name']),
  );
  // The merger, not a node_modules patch, removes library declarations from the
  // final APK/AAB. Exact component names leave all other services untouched.
  application.service.push(...unusedAudioServices.map(name => ({
    $: { 'android:name': name, 'tools:node': 'remove' },
  })));
  return androidManifest;
}

module.exports = config => withAndroidManifest(config, mod => {
  removeUnusedExpoAudioServices(mod.modResults);
  return mod;
});
Object.assign(module.exports, { removeUnusedExpoAudioServices, unusedAudioServices });
