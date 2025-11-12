/**
 * Utilitaires pour gérer les tokens JWT
 * Permet de décoder et extraire les payloads des tokens JWT
 */

export interface JWTPayload {
  sub?: string; // Subject (user ID)
  userId?: string;
  email?: string;
  phone?: string;
  role?: string;
  iat?: number; // Issued at
  exp?: number; // Expiration time
  [key: string]: any; // Autres propriétés du payload
}

/**
 * Décode une chaîne base64 en React Native
 * React Native n'a pas atob par défaut, donc on utilise un polyfill
 */
function base64Decode(str: string): string {
  try {
    // Remplacer les caractères URL-safe base64
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    
    // Ajouter le padding si nécessaire
    const paddedBase64 = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    
    // Utiliser le polyfill pour React Native
    return decodeBase64Polyfill(paddedBase64);
  } catch (error) {
    console.error('Erreur lors du décodage base64:', error);
    throw error;
  }
}

/**
 * Polyfill pour décoder base64 en React Native
 */
function decodeBase64Polyfill(base64: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  
  base64 = base64.replace(/[^A-Za-z0-9\+\/\=]/g, '');
  
  for (let i = 0; i < base64.length; i += 4) {
    const enc1 = chars.indexOf(base64.charAt(i));
    const enc2 = chars.indexOf(base64.charAt(i + 1));
    const enc3 = chars.indexOf(base64.charAt(i + 2));
    const enc4 = chars.indexOf(base64.charAt(i + 3));
    
    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;
    
    output += String.fromCharCode(chr1);
    
    if (enc3 !== 64) {
      output += String.fromCharCode(chr2);
    }
    if (enc4 !== 64) {
      output += String.fromCharCode(chr3);
    }
  }
  
  return output;
}

/**
 * Décode un token JWT sans vérification de signature
 * Note: Cette fonction ne vérifie pas la signature, elle décode uniquement le payload
 * Pour une vérification complète, utilisez une bibliothèque comme jsonwebtoken côté serveur
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    // Un JWT est composé de 3 parties séparées par des points: header.payload.signature
    const parts = token.split('.');
    
    if (parts.length !== 3) {
      console.error('Token JWT invalide: format incorrect');
      return null;
    }

    // Décoder le payload (deuxième partie)
    const payload = parts[1];
    
    // Décoder base64 en string
    const decodedString = base64Decode(payload);
    
    // Parser en JSON
    const decoded = JSON.parse(decodedString);
    
    return decoded as JWTPayload;
  } catch (error) {
    console.error('Erreur lors du décodage du token JWT:', error);
    return null;
  }
}

/**
 * Vérifie si un token JWT est expiré
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token);
  
  if (!payload || !payload.exp) {
    return true; // Considéré comme expiré si pas de date d'expiration
  }
  
  // exp est en secondes, Date.now() est en millisecondes
  const expirationTime = payload.exp * 1000;
  const currentTime = Date.now();
  
  return currentTime >= expirationTime;
}

/**
 * Vérifie si un token JWT expire bientôt (dans les prochaines minutes)
 */
export function isTokenExpiringSoon(token: string, minutesThreshold: number = 5): boolean {
  const payload = decodeJWT(token);
  
  if (!payload || !payload.exp) {
    return true;
  }
  
  const expirationTime = payload.exp * 1000;
  const currentTime = Date.now();
  const thresholdTime = minutesThreshold * 60 * 1000; // Convertir en millisecondes
  
  return expirationTime - currentTime <= thresholdTime;
}

/**
 * Extrait l'ID utilisateur depuis le payload du token
 */
export function getUserIdFromToken(token: string): string | null {
  const payload = decodeJWT(token);
  return payload?.sub || payload?.userId || null;
}

/**
 * Extrait le rôle utilisateur depuis le payload du token
 */
export function getUserRoleFromToken(token: string): string | null {
  const payload = decodeJWT(token);
  return payload?.role || null;
}

/**
 * Extrait toutes les informations utilisateur depuis le payload du token
 */
export function getUserInfoFromToken(token: string): Partial<JWTPayload> | null {
  const payload = decodeJWT(token);
  if (!payload) return null;
  
  return {
    userId: payload.sub || payload.userId,
    email: payload.email,
    phone: payload.phone,
    role: payload.role,
    ...payload,
  };
}

