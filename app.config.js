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
    newArchEnabled: true,

    ios: {
      bundleIdentifier: "com.biso.zwanga",
      buildNumber: "3",
      supportsTablet: true,
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
      blockedPermissions: [
        'android.permission.ACTIVITY_RECOGNITION',
      ],
    },

    web: {
      output: 'static',
      favicon: './assets/images/zwanga.png',
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
      // Cela garantit que l'OTP sera toujours requis en production
      EXPO_PUBLIC_ENV:
        process.env.EXPO_PUBLIC_ENV ||
        (process.env.NODE_ENV === 'production' ? 'production' : 
         process.env.NODE_ENV === 'development' ? 'development' : 
         'production'), // Par défaut, considérer comme production pour les builds
      // Google Maps API key
      EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,

      secureStoreKeys: {
        access: process.env.EXPO_PUBLIC_SECURESTORE_ACCESS_KEY,
        refresh: process.env.EXPO_PUBLIC_SECURESTORE_REFRESH_KEY,
      }
    },

    plugins: [
      'expo-router',
      'expo-maps',
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME,
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
      'expo-secure-store',
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    }
  },
};
