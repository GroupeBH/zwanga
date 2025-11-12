/**
 * Configuration Expo avec support des variables d'environnement
 * 
 * Ce fichier remplace app.json et permet de charger les variables depuis .env
 */

require('dotenv').config();

module.exports = {
  expo: {
    name: 'zwanga-app',
    slug: 'zwanga-app',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'zwangaapp',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
    },
    android: {
      googleServicesFile: './google-services.json',
      package: 'com.zwanga.app',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
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
    plugins: [
      'expo-router',
      'expo-notifications',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
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
    },
    // Variables d'environnement accessibles via Constants.expoConfig?.extra
    extra: {
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || 'https://api.zwanga.cd/v1',
      EXPO_PUBLIC_ENV: process.env.EXPO_PUBLIC_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
    },
  },
};

