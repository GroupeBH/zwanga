/* global __dirname */
const path = require('node:path');
const { AndroidConfig } = require('@expo/config-plugins');
const { configure } = require('../plugins/withIncomingRideAlerts');

// android/ is checked in: Expo config plugins alone do not run on EAS builds.
// Apply only our scoped manifest entries after dependencies are installed.
async function configureRideAlertBuild({
  root = path.resolve(__dirname, '..'), env = process.env,
  log = console.log, eas = false,
} = {}) {
  if (eas && !['android', 'ios'].includes(env.EAS_BUILD_PLATFORM))
    throw new Error('Plateforme EAS absente : configuration des alertes interrompue.');
  if (env.EAS_BUILD_PLATFORM === 'ios') {
    log(`[ride-alert-build] Transport iOS Firebase : ${env.EXPO_PUBLIC_IOS_FCM_ENABLED === 'true' ? 'activé (APNs/backend v5 à vérifier)' : 'désactivé'}.`);
    return;
  }
  const filename = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(filename);
  const enabled = env.ZWANGA_DRIVER_FULL_SCREEN_ENABLED === 'true';
  configure(manifest.manifest, enabled);
  await AndroidConfig.Manifest.writeAndroidManifestAsync(filename, manifest);
  log(`[ride-alert-build] Plein écran Android : ${enabled ? 'activé, accord du conducteur requis' : 'désactivé, permission retirée'}.`);
}

if (require.main === module) {
  configureRideAlertBuild({ eas: process.argv.includes('--eas') }).catch(() => {
    console.error('[ride-alert-build] Configuration native impossible. Build interrompu ; vérifier la plateforme et le manifeste Android.');
    process.exitCode = 1;
  });
}
module.exports = { configureRideAlertBuild };
