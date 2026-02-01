const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

/**
 * Plugin pour ajouter explicitement les permissions de localisation au manifest Android
 * Cela garantit que Google Play détecte correctement ces permissions
 */
const withAndroidLocationPermissions = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const { manifest } = androidManifest;

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const permissions = [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
    ];

    permissions.forEach((permission) => {
      // Vérifier si la permission existe déjà
      const existingPermissions = manifest['uses-permission'] || [];
      const exists = existingPermissions.some(
        (p) => p.$ && p.$['android:name'] === permission
      );

      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    });

    // Supprimer FOREGROUND_SERVICE_MEDIA_PLAYBACK si elle existe (bloquée car non utilisée)
    const blockedPermissions = [
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    ];

    if (manifest['uses-permission']) {
      manifest['uses-permission'] = manifest['uses-permission'].filter(
        (permission) => {
          const permissionName = permission.$ && permission.$['android:name'];
          return !blockedPermissions.includes(permissionName);
        }
      );
    }

    return config;
  });
};

module.exports = withAndroidLocationPermissions;

