const {
  withAndroidManifest,
  withAppDelegate,
  withGradleProperties,
  withPodfile,
  AndroidConfig,
} = require('@expo/config-plugins');

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

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

const withAndroidGoogleMapsApiKey = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application?.[0];

    if (!mainApplication) {
      return config;
    }

    if (!mainApplication['meta-data']) {
      mainApplication['meta-data'] = [];
    }

    const metaData = mainApplication['meta-data'];
    const existingEntry = metaData.find(
      (entry) => entry.$?.['android:name'] === 'com.google.android.geo.API_KEY',
    );

    if (existingEntry) {
      existingEntry.$['android:value'] = GOOGLE_MAPS_API_KEY || '';
    } else {
      metaData.push({
        $: {
          'android:name': 'com.google.android.geo.API_KEY',
          'android:value': GOOGLE_MAPS_API_KEY || '',
        },
      });
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
    const googleMapsPod = "  pod 'react-native-google-maps', path: '../node_modules/react-native-maps'";

    if (!content.includes("pod 'react-native-google-maps'")) {
      content = content.replace(
        /(\s+config = use_native_modules!\(config_command\))/,
        `\n${googleMapsPod}$1`,
      );
    }

    const nativeModuleBuildSettings = `
    # Some React Native pods import React headers while built as frameworks.
    # Keep modules enabled for dependencies that use @import, but avoid treating
    # these bridge pods as public Clang modules during archive builds.
    react_native_bridge_targets = [
      'react-native-maps',
      'react-native-google-maps',
      'RNFBApp',
      'RNFBAnalytics',
    ]

    installer.pods_project.targets.each do |target|
      if react_native_bridge_targets.include?(target.name)
        target.build_configurations.each do |build_config|
          build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
          build_config.build_settings['CLANG_ENABLE_MODULES'] = 'YES'
          build_config.build_settings['DEFINES_MODULE'] = 'NO'
        end
      end
    end`;

    if (!content.includes('react_native_bridge_targets')) {
      content = content.replace(
        /(react_native_post_install\([\s\S]*?\n\s*\))/,
        `$1\n${nativeModuleBuildSettings}`,
      );
    }

    config.modResults.contents = content;
    return config;
  });
};

const withIosGoogleMapsApiKey = (config) => {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      return config;
    }

    let content = config.modResults.contents;

    if (!content.includes('import GoogleMaps')) {
      content = content.replace('import FirebaseCore\n', 'import FirebaseCore\nimport GoogleMaps\n');
    }

    if (!content.includes('GMSServices.provideAPIKey')) {
      content = content.replace(
        '    let delegate = ReactNativeDelegate()',
        `    GMSServices.provideAPIKey("${GOOGLE_MAPS_API_KEY || ''}")\n\n    let delegate = ReactNativeDelegate()`,
      );
    }

    config.modResults.contents = content;
    return config;
  });
};

module.exports = (config) => {
  config = withAndroidLocationPermissions(config);
  config = withAndroidLargeScreenCompatibility(config);
  config = withAndroidGoogleMapsApiKey(config);
  config = withModernEdgeToEdgeGradleProperties(config);
  config = withReactNativeMapsFix(config);
  config = withIosGoogleMapsApiKey(config);
  return config;
};
