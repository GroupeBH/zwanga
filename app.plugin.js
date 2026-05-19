const { withAndroidManifest, withGradleProperties, AndroidConfig } = require('@expo/config-plugins');

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
      const existingPermissions = manifest['uses-permission'] || [];
      const exists = existingPermissions.some(
        (p) => p.$ && p.$['android:name'] === permission,
      );

      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    });

    return config;
  });
};

const withAndroidLargeScreenCompatibility = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application?.[0];
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);

    if (mainApplication?.$) {
      mainApplication.$['android:resizeableActivity'] = 'true';
    }

    if (mainActivity?.$) {
      delete mainActivity.$['android:screenOrientation'];
    }

    return config;
  });
};

const withModernEdgeToEdgeGradleProperties = (config) => {
  return withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter((property) => {
      const value = typeof property.value === 'string' ? property.value : '';
      return property.key !== 'expo.edgeToEdgeEnabled' && !value.includes('expo.edgeToEdgeEnabled');
    });

    return config;
  });
};

module.exports = (config) => {
  config = withAndroidLocationPermissions(config);
  config = withAndroidLargeScreenCompatibility(config);
  config = withModernEdgeToEdgeGradleProperties(config);
  return config;
};
