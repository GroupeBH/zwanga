# Gestion des tokens JWT avec SecureStore

Ce service gère le stockage sécurisé des tokens JWT (accessToken et refreshToken) en utilisant Expo SecureStore.

## Fonctionnalités

- **Stockage sécurisé** : Les tokens sont stockés dans le Keychain (iOS) ou Keystore (Android)
- **Gestion automatique** : Les tokens sont automatiquement stockés lors de la connexion/inscription
- **Récupération** : Les tokens sont chargés au démarrage de l'application
- **Nettoyage** : Les tokens sont supprimés lors de la déconnexion

## Utilisation

### Stockage des tokens

Les tokens sont automatiquement stockés lors de l'appel aux mutations `login` ou `register` :

```typescript
import { useLoginMutation } from '@/store/api/zwangaApi';

const [login] = useLoginMutation();

const handleLogin = async () => {
  const result = await login({ phone, password }).unwrap();
  // Les tokens sont automatiquement stockés dans SecureStore
  // result.accessToken et result.refreshToken
};
```

### Récupération des tokens

Les tokens sont automatiquement chargés au démarrage via `initializeAuth` dans `ReduxProvider`.

Pour récupérer manuellement :

```typescript
import { getAccessToken, getRefreshToken, getTokens } from '@/services/tokenStorage';

// Récupérer l'access token
const accessToken = await getAccessToken();

// Récupérer le refresh token
const refreshToken = await getRefreshToken();

// Récupérer les deux
const { accessToken, refreshToken } = await getTokens();
```

### Suppression des tokens

Les tokens sont automatiquement supprimés lors de la déconnexion via l'action `logout`.

Pour supprimer manuellement :

```typescript
import { clearTokens } from '@/services/tokenStorage';

await clearTokens();
```

## Extraction des payloads JWT

Pour extraire les informations du payload du token :

```typescript
import { 
  decodeJWT, 
  getUserInfoFromToken, 
  getUserIdFromToken,
  getUserRoleFromToken,
  isTokenExpired 
} from '@/utils/jwt';

const token = await getAccessToken();

if (token) {
  // Décoder le payload complet
  const payload = decodeJWT(token);
  
  // Récupérer les infos utilisateur
  const userInfo = getUserInfoFromToken(token);
  
  // Récupérer l'ID utilisateur
  const userId = getUserIdFromToken(token);
  
  // Récupérer le rôle
  const role = getUserRoleFromToken(token);
  
  // Vérifier si le token est expiré
  const expired = isTokenExpired(token);
}
```

## Structure du payload JWT

Le payload typique contient :

```typescript
{
  sub: string;        // Subject (user ID)
  userId?: string;    // User ID alternatif
  email?: string;     // Email utilisateur
  phone?: string;     // Téléphone utilisateur
  role?: string;      // Rôle utilisateur
  iat: number;       // Issued at (timestamp)
  exp: number;        // Expiration (timestamp)
}
```

## Sécurité

- Les tokens sont stockés dans le Keychain/Keystore du système
- Les tokens ne sont jamais stockés en clair
- Les tokens sont automatiquement inclus dans les headers des requêtes API
- Les tokens sont supprimés lors de la déconnexion

