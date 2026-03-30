/**
 * Configuration Expo avec support des variables d'environnement
 * 
 * Ce fichier remplace app.json et permet de charger les variables depuis .env
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Public OAuth client IDs (safe to ship in the app).
// Keep fallbacks so cloud builds still work even when .env is not uploaded.
const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '754065251959-scmvdlel13lf7kpbg3tdmevl7hj0299s.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
  '754065251959-chelbj9aa06c2ifbpnmcot2mt6p61rkp.apps.googleusercontent.com';
const GOOGLE_IOS_URL_SCHEME =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ||
  'com.googleusercontent.apps.754065251959-chelbj9aa06c2ifbpnmcot2mt6p61rkp';
const GOOGLE_IOS_SERVICES_FILE = './GoogleService-Info.plist';
const HAS_IOS_GOOGLE_SERVICES_FILE = fs.existsSync(
  path.resolve(process.cwd(), GOOGLE_IOS_SERVICES_FILE),
);
const META_APP_ID = process.env.EXPO_PUBLIC_META_APP_ID || process.env.META_APP_ID || '';
const META_CLIENT_TOKEN =
  process.env.EXPO_PUBLIC_META_CLIENT_TOKEN || process.env.META_CLIENT_TOKEN || '';
const META_DISPLAY_NAME =
  process.env.EXPO_PUBLIC_META_DISPLAY_NAME || process.env.META_DISPLAY_NAME || 'Zwanga';
const HAS_META_APP_EVENTS = Boolean(META_APP_ID && META_CLIENT_TOKEN);

module.exports = {
  expo: {
    name: 'zwanga',
    slug: 'zwanga-app',
    version: '1.0.1',
    orientation: 'portrait',
    icon: './assets/images/zwanga.png',
    scheme: 'zwanga',
    userInterfaceStyle: 'automatic',
    // Required by react-native-reanimated v4 on Expo SDK 54 / RN 0.81
    newArchEnabled: true,

    ios: {
      bundleIdentifier: "com.biso.zwanga",
      buildNumber: "3",
      supportsTablet: true,
      ...(HAS_IOS_GOOGLE_SERVICES_FILE
        ? { googleServicesFile: GOOGLE_IOS_SERVICES_FILE }
        : {}),
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "Zwanga utilise votre position pour afficher les trajets à proximité.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "Zwanga utilise votre position pour détecter votre emplacement même lorsque l'application est en arrière-plan.",
        NSLocationAlwaysUsageDescription: "Zwanga nécessite un accès constant à votre position pour fournir des trajets précis.",
        NSCameraUsageDescription: "L'appareil photo est utilisé pour prendre des photos de profil ou des documents.",
        NSPhotoLibraryUsageDescription: "Zwanga nécessite l'accès à votre galerie pour permettre l'envoi d'images.",
        NSContactsUsageDescription: "Zwanga utilise vos contacts pour faciliter l'invitation d'amis.",
        // NSUserTrackingUsageDescription: "Votre identifiant peut être utilisé pour fournir une meilleure expérience publicitaire.",
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ['remote-notification', 'fetch'],
      },
    },

    android: {
      googleServicesFile: './google-services.json',
      package: 'com.zwanga',
      versionCode: 3,
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/zwanga-adaptative.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      // Explicitly block ACTIVITY_RECOGNITION permission
      // We only use Accelerometer for device stability detection, not activity recognition
      // Block FOREGROUND_SERVICE_MEDIA_PLAYBACK as we don't use audio playback in foreground
      blockedPermissions: [
        'android.permission.ACTIVITY_RECOGNITION',
        'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      ],
      // Permissions pour la localisation (incluant arrière-plan pour la navigation)
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_LOCATION',
        'com.google.android.gms.permission.AD_ID',
      ],
    },

    web: {
      output: 'static',
      favicon: './assets/images/zwanga.png',
    },

    autolinking: {
      android: {
        exclude: HAS_META_APP_EVENTS ? [] : ['react-native-fbsdk-next'],
      },
      ios: {
        exclude: HAS_META_APP_EVENTS ? [] : ['react-native-fbsdk-next'],
      },
    },

    // ✅ EXTRA — version fusionnée et corrigée
    extra: {
      // project ID pour EAS (obligatoire)
      eas: {
        projectId: "164a67a3-04b8-4c34-9616-576391669e76"
      },

      // variables publiques
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
      // En production (build EAS), forcer 'production' si NODE_ENV n'est pas défini
      // Cela force un mode env coherent pour les builds release
      EXPO_PUBLIC_ENV:
        process.env.EXPO_PUBLIC_ENV ||
        (process.env.NODE_ENV === 'production' ? 'production' : 
         process.env.NODE_ENV === 'development' ? 'development' : 
         'production'), // Par défaut, considérer comme production pour les builds
      // Feature flag OTP inscription (desactive par defaut pour bypass temporaire)
      EXPO_PUBLIC_ENABLE_SIGNUP_OTP:
        process.env.EXPO_PUBLIC_ENABLE_SIGNUP_OTP || 'false',
      // Google Maps API key
      EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      // Google Sign-In OAuth IDs
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: GOOGLE_WEB_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: GOOGLE_IOS_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME: GOOGLE_IOS_URL_SCHEME,
      EXPO_PUBLIC_META_APP_ID: META_APP_ID,
      EXPO_PUBLIC_META_ENABLED: HAS_META_APP_EVENTS,

      secureStoreKeys: {
        access: process.env.EXPO_PUBLIC_SECURESTORE_ACCESS_KEY,
        refresh: process.env.EXPO_PUBLIC_SECURESTORE_REFRESH_KEY,
      }
    },

    plugins: [
      'expo-router',
      '@react-native-firebase/app',
      'expo-maps',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'Zwanga utilise votre position pour la navigation GPS même en arrière-plan.',
          locationAlwaysPermission: 'Zwanga a besoin de votre position en arrière-plan pour continuer la navigation.',
          locationWhenInUsePermission: 'Zwanga utilise votre position pour afficher les trajets à proximité et la navigation.',
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: GOOGLE_IOS_URL_SCHEME,
        },
      ],
      [
        "expo-notifications",
        {
          "icon": "./assets/images/zwanga.png",
          "color": "#ffffff",
          "defaultChannel": "default",
          "enableBackgroundRemoteNotifications": true
        }
      ],
      [
        "expo-task-manager",
        {
          "backgroundNotificationTask": "background-notification-task"
        }
      ],
      [
        'expo-contacts',
        {
          contactsPermission: 'Autorisez zwanga à accéder à vos contacts.'
        }
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/images/zwanga2000.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            backgroundColor: '#000000',
          },
        },
      ],
      ...(HAS_META_APP_EVENTS
        ? [
            [
              'react-native-fbsdk-next',
              {
                appID: META_APP_ID,
                clientToken: META_CLIENT_TOKEN,
                displayName: META_DISPLAY_NAME,
                scheme: `fb${META_APP_ID}`,
                advertiserIDCollectionEnabled: false,
                iosUserTrackingPermission:
                  'Autorisez Zwanga a mesurer certaines actions pour ameliorer l application.',
              },
            ],
          ]
        : []),
      'expo-secure-store',
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    }
  },
};
