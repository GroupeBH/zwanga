import Constants from 'expo-constants';

/**
 * Configuration des variables d'environnement
 * 
 * Dans Expo, les variables d'environnement publiques doivent être préfixées par EXPO_PUBLIC_
 * Elles sont accessibles via Constants.expoConfig?.extra
 */

interface EnvConfig {
  apiUrl: string;
  env: 'development' | 'staging' | 'production';
}

/**
 * Récupère la configuration depuis les variables d'environnement
 */
function getEnvConfig(): EnvConfig {
  // Récupérer depuis Constants (Expo)
  const extra = Constants.expoConfig?.extra || {};
  
  // Récupérer depuis process.env (fallback pour développement)
  const apiUrl = 
    extra.EXPO_PUBLIC_API_URL || 
    process.env.EXPO_PUBLIC_API_URL || 
    (__DEV__ ? 'http://192.168.226.134:5000/api/v1' : 'https://api.zwanga.cd/v1');
  
  // Détection robuste de l'environnement
  // Priorité : extra.EXPO_PUBLIC_ENV > process.env.EXPO_PUBLIC_ENV > __DEV__
  let env = (
    extra.EXPO_PUBLIC_ENV || 
    process.env.EXPO_PUBLIC_ENV || 
    (__DEV__ ? 'development' : 'production')
  ) as 'development' | 'staging' | 'production';
  
  // IMPORTANT: En production (build Play Store/App Store), __DEV__ sera toujours false
  // Si __DEV__ est false et que l'env détecté est 'development', c'est une erreur de configuration
  // On force donc 'production' pour garantir que l'OTP sera toujours requis
  if (!__DEV__ && env === 'development') {
    console.warn('[env.ts] Warning: __DEV__ is false but env is "development". Forcing to "production" to ensure OTP is required.');
    env = 'production';
  }
  
  // Log pour déboguer en production (sera visible dans les logs de l'app)
  if (!__DEV__) {
    console.log('[env.ts] Production build detected:', {
      __DEV__,
      extraEnv: extra.EXPO_PUBLIC_ENV,
      processEnv: process.env.EXPO_PUBLIC_ENV,
      finalEnv: env,
      isDevelopment: env === 'development',
      isProduction: env === 'production',
    });
  }
  
  return {
    apiUrl,
    env,
  };
}

export const envConfig = getEnvConfig();

/**
 * Vérifie si on est en mode développement
 */
export const isDevelopment = envConfig.env === 'development';

/**
 * Vérifie si on est en mode production
 */
export const isProduction = envConfig.env === 'production';

/**
 * URL de base de l'API
 */
export const API_BASE_URL = envConfig.apiUrl;

