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
    'https://api.zwanga.cd/v1';
  
  const env = (
    extra.EXPO_PUBLIC_ENV || 
    process.env.EXPO_PUBLIC_ENV || 
    __DEV__ ? 'development' : 'production'
  ) as 'development' | 'staging' | 'production';

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

