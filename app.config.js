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
      supportsTablet: true,
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

      secureStoreKeys: {
        access: process.env.EXPO_PUBLIC_SECURESTORE_ACCESS_KEY,
        refresh: process.env.EXPO_PUBLIC_SECURESTORE_REFRESH_KEY,
      }
    },

    plugins: [
      'expo-router',
      'expo-notifications',
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
