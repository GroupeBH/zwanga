/**
 * Configuration Expo avec support des variables d'environnement
 * 
 * Ce fichier remplace app.json et permet de charger les variables depuis .env
 */

require('dotenv').config();

module.exports = {
  expo: {
    name: 'zwanga',
    slug: 'zwanga-app',
    version: '1.0.1',
    orientation: 'portrait',
    icon: './assets/images/zwanga.png',
    scheme: 'zwanga',
    userInterfaceStyle: 'automatic',
    newArchEnabled: false,

    ios: {
      bundleIdentifier: "com.biso.zwanga",   // ⚠️ DOIT être unique et identique sur App Store Connect
      buildNumber: "3",                      // Aligné avec version Android
      supportsTablet: true,
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "Zwanga utilise votre position pour afficher les trajets à proximité.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "Zwanga utilise votre position pour détecter votre emplacement même lorsque l'application est en arrière-plan.",
        NSLocationAlwaysUsageDescription: "Zwanga nécessite un accès constant à votre position pour fournir des trajets précis.",
        NSCameraUsageDescription: "L'appareil photo est utilisé pour prendre des photos de profil ou des documents.",
        NSPhotoLibraryUsageDescription: "Zwanga nécessite l'accès à votre galerie pour permettre l'envoi d'images.",
        NSContactsUsageDescription: "Zwanga utilise vos contacts pour faciliter l'invitation d'amis.",
        // NSUserTrackingUsageDescription: "Votre identifiant peut être utilisé pour fournir une meilleure expérience publicitaire.",
    }
    },

    android: {
      googleServicesFile: './google-services.json',
      package: 'com.zwanga',
      versionCode: 3,
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
      blockedPermissions: [
        'android.permission.ACTIVITY_RECOGNITION',
      ],
    },

    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },

    // ✅ EXTRA — version fusionnée et corrigée
    extra: {
      // project ID pour EAS (obligatoire)
      eas: {
        projectId: "164a67a3-04b8-4c34-9616-576391669e76"
      },

      // variables publiques
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
      EXPO_PUBLIC_ENV:
        process.env.EXPO_PUBLIC_ENV ||
        (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
      // Mapbox access token for routing
      EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN,
      // Google Maps API key (désactivé pour le moment, en attente de configuration)
      // EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,

      secureStoreKeys: {
        access: process.env.EXPO_PUBLIC_SECURESTORE_ACCESS_KEY,
        refresh: process.env.EXPO_PUBLIC_SECURESTORE_REFRESH_KEY,
      }
    },

    plugins: [
      'expo-router',
      'expo-notifications',
      [
        '@rnmapbox/maps',
        {
          RNMapboxMapsImpl: 'mapbox',
          android: {
            accessToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN,
          },
          ios: {
            accessToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN,
          }
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
      'expo-secure-store',
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    }
  },
};
