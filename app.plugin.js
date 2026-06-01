const { withAndroidManifest, withGradleProperties, withPodfile, AndroidConfig } = require('@expo/config-plugins');

const withIOSModularHeaders = (config) => {
  return withPodfile(config, async (config) => {
    const podfileContent = config.modResults.contents;
    
    // Only add if not already present
    if (!podfileContent.includes('use_modular_headers!')) {
      // Insert after platform declaration but before use_react_native!
      const lines = podfileContent.split('\n');
      const newLines = [];
      let inserted = false;
      
      for (const line of lines) {
        newLines.push(line);
        // Insert after platform line and before react native
        if (!inserted && line.trim().startsWith('platform :ios')) {
          newLines.push('use_modular_headers!');
          inserted = true;
        }
      }
      
      config.modResults.contents = newLines.join('\n');
    }
    return config;
  });
};

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

const withReactNativeMapsFix = (config) => {
  return withPodfile(config, async (config) => {
    let content = config.modResults.contents;
    
    // Add modular headers for React-Core specifically
    if (!content.includes("pod 'React-Core', :modular_headers => true")) {
      // Replace the React-Core pod declaration
      content = content.replace(
        /pod\s+['"]React-Core['"]\s*(,?\s*[\s\S]*?)?(?=\n)/,
        "pod 'React-Core', :modular_headers => true"
      );
      config.modResults.contents = content;
    }
    return config;
  });
};

module.exports = (config) => {
  config = withIOSModularHeaders(config);
  config = withAndroidLocationPermissions(config);
  config = withAndroidLargeScreenCompatibility(config);
  config = withModernEdgeToEdgeGradleProperties(config);
  config = withReactNativeMapsFix(config);
  return config;
};
