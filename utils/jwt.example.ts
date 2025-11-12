/**
 * Exemples d'utilisation des utilitaires JWT
 * 
 * Ce fichier montre comment utiliser les fonctions de décodage JWT
 */

import { 
  decodeJWT, 
  getUserInfoFromToken, 
  getUserIdFromToken,
  getUserRoleFromToken,
  isTokenExpired,
  isTokenExpiringSoon 
} from './jwt';
import { getAccessToken } from '../services/tokenStorage';

// Exemple 1: Décoder un token JWT
export async function exampleDecodeToken() {
  const token = await getAccessToken();
  
  if (!token) {
    console.log('Aucun token disponible');
    return;
  }
  
  // Décoder le payload complet
  const payload = decodeJWT(token);
  console.log('Payload JWT:', payload);
  
  // Afficher les informations
  if (payload) {
    console.log('User ID:', payload.sub || payload.userId);
    console.log('Email:', payload.email);
    console.log('Role:', payload.role);
    console.log('Expiration:', new Date(payload.exp! * 1000));
  }
}

// Exemple 2: Extraire les informations utilisateur
export async function exampleGetUserInfo() {
  const token = await getAccessToken();
  
  if (!token) {
    return null;
  }
  
  // Récupérer toutes les infos utilisateur
  const userInfo = getUserInfoFromToken(token);
  console.log('User Info:', userInfo);
  
  return userInfo;
}

// Exemple 3: Vérifier l'expiration du token
export async function exampleCheckTokenExpiration() {
  const token = await getAccessToken();
  
  if (!token) {
    return false;
  }
  
  // Vérifier si le token est expiré
  const expired = isTokenExpired(token);
  
  if (expired) {
    console.log('Le token est expiré, une reconnexion est nécessaire');
    return false;
  }
  
  // Vérifier si le token expire bientôt (dans les 5 prochaines minutes)
  const expiringSoon = isTokenExpiringSoon(token, 5);
  
  if (expiringSoon) {
    console.log('Le token expire bientôt, pensez à le rafraîchir');
  }
  
  return true;
}

// Exemple 4: Utiliser dans un composant React
export function useTokenInfo() {
  const token = getAccessToken();
  
  if (!token) {
    return {
      userId: null,
      role: null,
      isExpired: true,
      expiresAt: null,
    };
  }
  
  const payload = decodeJWT(token);
  
  return {
    userId: getUserIdFromToken(token),
    role: getUserRoleFromToken(token),
    isExpired: isTokenExpired(token),
    expiresAt: payload?.exp ? new Date(payload.exp * 1000) : null,
    payload,
  };
}

