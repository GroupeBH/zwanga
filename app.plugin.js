const { withAndroidManifest, withGradleProperties, withPodfile, withXcodeProject, AndroidConfig } = require('@expo/config-plugins');

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

const withIOSUserScriptSandboxingDisabled = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;

    project.addBuildProperty('ENABLE_USER_SCRIPT_SANDBOXING', 'NO');

    return config;
  });
};

const withReactNativeMapsFix = (config) => {
  return withPodfile(config, async (config) => {
    let content = config.modResults.contents;

    const mapsBuildSettings = `
    # react-native-maps imports React headers while built as a framework.
    # Xcode 26 treats those imports as errors unless this is explicitly allowed.
    installer.pods_project.targets.each do |target|
      if ['react-native-maps', 'react-native-google-maps'].include?(target.name)
        target.build_configurations.each do |build_config|
          build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        end
      end
    end`;

    if (!content.includes('CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES')) {
      content = content.replace(
        /(react_native_post_install\([\s\S]*?\n\s*\))/,
        `$1\n${mapsBuildSettings}`,
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
  config = withIOSUserScriptSandboxingDisabled(config);
  config = withReactNativeMapsFix(config);
  return config;
};
