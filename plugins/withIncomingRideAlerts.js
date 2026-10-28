const { withAndroidManifest } = require('@expo/config-plugins');

// Native capability only; each driver still opts in and Android checks special access.
const isFullScreenBuildEnabled = value => value === undefined || value === 'true';

function configure(manifest, enabled) {
  const app = manifest.application[0];
  app['meta-data'] = (app['meta-data'] || []).filter(item => item.$['android:name'] !== 'com.zwanga.RIDE_FULL_SCREEN_ENABLED');
  app['meta-data'].push({ $: { 'android:name': 'com.zwanga.RIDE_FULL_SCREEN_ENABLED', 'android:value': String(enabled) } });
  app.activity = (app.activity || []).filter(item => item.$['android:name'] !== 'com.zwanga.notifications.IncomingRideActivity');
  app.activity.push({ $: { 'android:name': 'com.zwanga.notifications.IncomingRideActivity', 'android:exported': 'false',
    'android:excludeFromRecents': 'true', 'android:theme': '@style/AppTheme' } });
  manifest['uses-permission'] = (manifest['uses-permission'] || []).filter(item => item.$['android:name'] !== 'android.permission.USE_FULL_SCREEN_INTENT');
  if (enabled) manifest['uses-permission'].push({ $: { 'android:name': 'android.permission.USE_FULL_SCREEN_INTENT' } });
}
module.exports = (config, { enabled = false } = {}) => withAndroidManifest(require('./withDriverAlertSources')(config), mod => {
  configure(mod.modResults.manifest, enabled === true); return mod;
});
module.exports.configure = configure;
module.exports.isFullScreenBuildEnabled = isFullScreenBuildEnabled;
