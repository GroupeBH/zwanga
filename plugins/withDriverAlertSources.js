const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod, withMainApplication, withAndroidManifest, withAppBuildGradle } = require('@expo/config-plugins');

const sourceFiles = ['DriverAlertModule.java', 'DriverAlertPackage.java', 'ForegroundAlertPlayer.java', 'IncomingRideActivity.java',
  'NativeRideDelivery.java', 'RideNotificationBundle.java', 'RideFirebaseMessagingService.java', 'RideCardDelivery.java', 'RideCardFallback.java', 'RideDeliveryWorker.java'];
const sourceDirectory = 'native/android/notifications';
const outputDirectory = 'app/src/main/java/com/zwanga/notifications';
const registration = 'add(com.zwanga.notifications.DriverAlertPackage())';
const androidSoundSource = 'assets/sounds/android/driver_ring.wav';
const androidSoundOutput = 'app/src/main/res/raw/driver_ring.wav';
const nativeDependencies = `    // Zwanga native ride receiver: same libraries already provided by Expo/Notifee.
    implementation('com.google.firebase:firebase-messaging:24.0.1')
    implementation('app.notifee:core:202108261754')
    implementation('androidx.work:work-runtime:2.8.0')
    implementation('com.google.guava:guava:33.3.1-android')`;
function registerNativeDependencies(source) {
  if (source.includes(nativeDependencies)) return source;
  if (source.includes("implementation('app.notifee:core:202108261754')")) {
    for (const dependency of ["implementation('androidx.work:work-runtime:2.8.0')", "implementation('com.google.guava:guava:33.3.1-android')"])
      if (!source.includes(dependency)) source = source.replace(/^dependencies \{/m, match => `${match}\n    ${dependency}`);
    return source;
  }
  if ((source.match(/^dependencies \{/gm) || []).length !== 1) throw new Error('Driver alerts: unsupported app dependencies block.');
  return source.replace(/^dependencies \{/m, `dependencies {\n${nativeDependencies}`);
}

function registerMessagingService(manifest) {
  manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  const app = manifest.manifest.application[0];
  const expo = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';
  const own = 'com.zwanga.notifications.RideFirebaseMessagingService';
  app.service = (app.service || []).filter(s => ![expo, own].includes(s.$['android:name']));
  app.service.push({ $: { 'android:name': expo, 'tools:node': 'remove' } },
    { $: { 'android:name': own, 'android:exported': 'false' }, 'intent-filter': [{ $: { 'android:priority': '-1' },
      action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }] }] });
  return manifest;
}

function registerPackage(source) {
  const entries = source.split(registration).length - 1;
  if (entries === 1) return source;
  const anchor = /PackageList\(this\)\.packages\.apply\s*\{/g;
  if (entries || [...source.matchAll(anchor)].length !== 1) {
    throw new Error('Driver alerts: unsupported MainApplication; package registration must be reviewed.');
  }
  return source.replace(anchor, match => `${match}\n              ${registration}`);
}

function installSources(projectRoot, platformProjectRoot) {
  // Read all canonical sources first. Never depend on a previous android/ tree:
  // prebuild --clean deletes it. Only these owned generated files are replaced.
  const files = sourceFiles.map(name => [name, fs.readFileSync(path.join(projectRoot, sourceDirectory, name))]);
  const sound = fs.readFileSync(path.join(projectRoot, androidSoundSource));
  const target = path.join(platformProjectRoot, outputDirectory);
  fs.mkdirSync(target, { recursive: true });
  for (const [name, content] of files) fs.writeFileSync(path.join(target, name), content);
  // Registered before expo-notifications, this Android mod runs after its copy.
  // Keep the resource/channel name stable so existing mute choices stay intact.
  const soundTarget = path.join(platformProjectRoot, androidSoundOutput);
  fs.mkdirSync(path.dirname(soundTarget), { recursive: true });
  fs.writeFileSync(soundTarget, sound);
}

module.exports = config => {
  config = withAndroidManifest(config, mod => { registerMessagingService(mod.modResults); return mod; });
  config = withAppBuildGradle(config, mod => { mod.modResults.contents = registerNativeDependencies(mod.modResults.contents); return mod; });
  config = withMainApplication(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('Driver alerts require the supported Kotlin MainApplication template.');
    mod.modResults.contents = registerPackage(mod.modResults.contents);
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    installSources(mod.modRequest.projectRoot, mod.modRequest.platformProjectRoot);
    return mod;
  }]);
};
Object.assign(module.exports, { sourceFiles, sourceDirectory, outputDirectory, registration, registerPackage, installSources, androidSoundSource, androidSoundOutput, registerMessagingService, registerNativeDependencies });
