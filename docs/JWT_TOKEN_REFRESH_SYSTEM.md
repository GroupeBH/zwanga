# Système de rafraîchissement automatique des tokens JWT

## 🎯 Objectif

Implémenter un système complet de gestion des tokens JWT avec rafraîchissement automatique pour :
1. Vérifier la validité des tokens au démarrage de l'app
2. Rafraîchir automatiquement l'access token quand il expire
3. Gérer les erreurs 401 en tentant de rafraîchir le token
4. Rediriger vers la page de connexion si le refresh token est invalide

## 📋 Architecture

### Vue d'ensemble

```
┌─────────────────┐
│ App Démarrage   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│ ReduxProvider                   │
│ ├─ initializeAuth()             │
│ │  └─ validateAndRefreshTokens()│
│ └─ AuthGuard                    │
└────────┬────────────────────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐  ┌──────────┐
│ /auth  │  │ /(tabs)  │
└────────┘  └──────────┘
```

### Flux de rafraîchissement

```
1. Requête API
   │
   ▼
2. prepareHeaders
   │
   └─> getValidAccessToken()
       │
       ├─ Token valide ? → Utiliser
       │
       └─ Token expiré ?
          │
          └─> refreshAccessToken()
              │
              ├─ Success → Nouveau token
              │
              └─ Fail → Déconnexion
```

## 🔧 Composants principaux

### 1. `services/tokenRefresh.ts`

Service de gestion du rafraîchissement des tokens.

#### Fonctions principales

**`validateAndRefreshTokens()`**
```typescript
// Vérifie et rafraîchit les tokens au démarrage
const isAuthenticated = await validateAndRefreshTokens();
```
- Vérifie l'access token
- Si expiré, vérifie le refresh token
- Rafraîchit automatiquement si possible
- Retourne `true` si authentifié, `false` sinon

**`refreshAccessToken(refreshToken)`**
```typescript
// Rafraîchit l'access token
const newAccessToken = await refreshAccessToken(refreshToken);
```
- Appelle l'API `/auth/refresh`
- Stocke les nouveaux tokens dans SecureStore
- Met à jour Redux
- Retourne le nouveau token ou `null`

**`getValidAccessToken()`**
```typescript
// Récupère un access token valide
const token = await getValidAccessToken();
```
- Vérifie la validité du token actuel
- Rafraîchit automatiquement si nécessaire
- Utilisé avant chaque requête API

**`handle401Error()`**
```typescript
// Gère les erreurs 401
const refreshed = await handle401Error();
```
- Appelé quand une requête retourne 401
- Tente de rafraîchir le token
- Retourne `true` si réussi

#### Protection contre les rafraîchissements multiples

```typescript
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;
```

Si plusieurs requêtes échouent simultanément, elles partagent la même promesse de rafraîchissement.

### 2. `store/api/baseApi.ts`

Configuration de base de RTK Query avec gestion automatique du rafraîchissement.

#### Base Query avec authentification

```typescript
const baseQueryWithAuth = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: async (headers) => {
    // Récupère automatiquement un token valide
    const accessToken = await getValidAccessToken();
    if (accessToken) {
      headers.set('authorization', `Bearer ${accessToken}`);
    }
    return headers;
  },
});
```

#### Gestion des erreurs 401

```typescript
const baseQueryWithReauth: BaseQueryFn = async (args, api, extraOptions) => {
  let result = await baseQueryWithAuth(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    const refreshed = await handle401Error();
    
    if (refreshed) {
      // Réessayer la requête
      result = await baseQueryWithAuth(args, api, extraOptions);
    }
  }

  return result;
};
```

### 3. `store/api/authApi.ts`

Endpoint de rafraîchissement des tokens.

```typescript
refreshToken: builder.mutation<
  { accessToken: string; refreshToken: string },
  { refreshToken: string }
>({
  query: (data) => ({
    url: '/auth/refresh',
    method: 'POST',
    body: data,
  }),
  async onQueryStarted(arg, { dispatch, queryFulfilled }) {
    const { data } = await queryFulfilled;
    await storeTokens(data.accessToken, data.refreshToken);
  },
}),
```

### 4. `store/slices/authSlice.ts`

Gestion du state d'authentification avec initialisation améliorée.

```typescript
export const initializeAuth = createAsyncThunk(
  'auth/initialize',
  async () => {
    // Valider et rafraîchir les tokens
    const isAuthenticated = await validateAndRefreshTokens();
    
    if (!isAuthenticated) {
      return null;
    }
    
    // Récupérer les tokens (potentiellement rafraîchis)
    const { accessToken, refreshToken } = await getTokens();
    
    return {
      accessToken,
      refreshToken,
      tokenPayload: decodeJWT(accessToken),
      userInfo: getUserInfoFromToken(accessToken),
    };
  }
);
```

### 5. `components/AuthGuard.tsx`

Protection des routes et redirection automatique.

```typescript
export function AuthGuard({ children }) {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const isLoading = useAppSelector(selectIsLoading);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/auth');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}
```

## 🔄 Scénarios d'utilisation

### Scénario 1 : Démarrage de l'app

1. **App démarre** → `ReduxProvider` monte
2. **`initializeAuth()`** est appelé
3. **`validateAndRefreshTokens()`** vérifie les tokens
   - Pas de tokens → `isAuthenticated = false`
   - Access token valide → `isAuthenticated = true`
   - Access token expiré, refresh valide → Rafraîchir → `isAuthenticated = true`
   - Refresh token expiré → `isAuthenticated = false`
4. **`AuthGuard`** redirige selon `isAuthenticated`
   - `false` → `/auth`
   - `true` → `/(tabs)`

### Scénario 2 : Requête API avec token expiré

1. **Utilisateur fait une action** → Requête API
2. **`prepareHeaders`** appelle `getValidAccessToken()`
3. **Token est expiré** → `refreshAccessToken()` est appelé
4. **Refresh réussi** → Nouveau token utilisé
5. **Requête refaite** avec le nouveau token
6. **Succès** ✅

### Scénario 3 : Erreur 401 inattendue

1. **Requête API** → Retourne 401
2. **`baseQueryWithReauth`** détecte le 401
3. **`handle401Error()`** est appelé
4. **Rafraîchissement du token**
   - Succès → Requête refaite
   - Échec → Déconnexion + Redirection vers `/auth`

### Scénario 4 : Refresh token expiré

1. **Token expiré** détecté
2. **Tentative de rafraîchissement** → Échec (refresh expiré)
3. **`clearTokens()`** nettoie SecureStore
4. **`logout()`** met à jour Redux
5. **`AuthGuard`** redirige vers `/auth`

## 📡 API Backend requise

### Endpoint de rafraîchissement

**POST `/auth/refresh`**

**Request**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (Success)**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..." // Peut être le même ou un nouveau
}
```

**Response (Error)**
```json
{
  "message": "Refresh token invalide ou expiré",
  "statusCode": 401
}
```

### Exemple d'implémentation NestJS

```typescript
@Post('refresh')
async refreshToken(@Body() { refreshToken }: RefreshTokenDto) {
  try {
    // Vérifier la validité du refresh token
    const payload = this.jwtService.verify(refreshToken, {
      secret: process.env.JWT_REFRESH_SECRET,
    });

    // Générer un nouveau access token
    const newAccessToken = this.jwtService.sign(
      { sub: payload.sub, email: payload.email },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' }
    );

    // Optionnel : Générer un nouveau refresh token
    const newRefreshToken = this.jwtService.sign(
      { sub: payload.sub },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d' }
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  } catch (error) {
    throw new UnauthorizedException('Refresh token invalide');
  }
}
```

## ⚙️ Configuration

### Variables d'environnement

```env
# .env
EXPO_PUBLIC_API_URL=https://api.zwanga.cd/v1
```

### Durées recommandées

```typescript
// Access Token: 15 minutes
expiresIn: '15m'

// Refresh Token: 7 jours
expiresIn: '7d'

// Seuil de rafraîchissement préventif: 5 minutes
isTokenExpiringSoon(token, 5)
```

## 🔐 Sécurité

### Bonnes pratiques implémentées

✅ **Tokens stockés dans SecureStore** (Keychain/Keystore)
✅ **Refresh token vérifié avant utilisation**
✅ **Déconnexion automatique si refresh échoue**
✅ **Protection contre les rafraîchissements multiples**
✅ **Nettoyage complet des tokens à la déconnexion**

### Recommandations backend

⚠️ **Rotation des refresh tokens** - Générer un nouveau refresh token à chaque refresh
⚠️ **Blacklist des refresh tokens** - Invalider les anciens refresh tokens
⚠️ **Rate limiting** - Limiter les appels à `/auth/refresh`
⚠️ **Logs de sécurité** - Logger les tentatives de rafraîchissement

## 🐛 Debugging

### Logs utiles

```typescript
// Activation
console.log('Access token valide');
console.log('Rafraîchissement de l\'access token...');
console.log('Tokens rafraîchis avec succès');
console.log('Erreur 401 détectée, tentative de rafraîchissement...');
```

### Vérifier l'état

```typescript
// Dans Redux DevTools
state.auth.isAuthenticated
state.auth.accessToken
state.auth.refreshToken
```

### Tester le rafraîchissement

```typescript
// Forcer l'expiration d'un token (pour test uniquement)
import { isTokenExpired } from '@/utils/jwt';

const token = await getAccessToken();
console.log('Token expiré?', isTokenExpired(token));
```

## 📊 Diagramme de séquence

```
User          App          AuthGuard      TokenService     API
 │             │              │                │             │
 │ Ouvre App  │              │                │             │
 │────────────>│              │                │             │
 │             │initializeAuth│                │             │
 │             │─────────────>│                │             │
 │             │              │validateTokens  │             │
 │             │              │───────────────>│             │
 │             │              │                │/auth/refresh│
 │             │              │                │───────────>│
 │             │              │                │<───────────│
 │             │              │<───────────────│             │
 │             │<─────────────│ Authenticated  │             │
 │             │              │                │             │
 │             │ Redirect     │                │             │
 │<────────────│─────────────>│                │             │
 │             │              │                │             │
 │ Action API │              │                │             │
 │────────────>│              │                │   GET /api  │
 │             │              │                │───────────>│
 │             │              │                │  401 Error  │
 │             │              │                │<───────────│
 │             │              │   handle401    │             │
 │             │              │───────────────>│             │
 │             │              │                │/auth/refresh│
 │             │              │                │───────────>│
 │             │              │                │<───────────│
 │             │              │                │  GET /api   │
 │             │              │                │───────────>│
 │             │              │                │   Success   │
 │<────────────│──────────────│────────────────│<───────────│
```

## 🎓 Exemple d'utilisation

### Dans un composant

```typescript
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';

function MyComponent() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  
  // L'authentification est gérée automatiquement
  // Pas besoin de vérifier manuellement les tokens
  
  if (!isAuthenticated) {
    // AuthGuard redirigera automatiquement
    return null;
  }
  
  return <YourContent />;
}
```

### Faire une requête API

```typescript
import { useGetTripsQuery } from '@/store/api/tripApi';

function TripsScreen() {
  // Le token est automatiquement géré
  // Rafraîchi si nécessaire avant la requête
  const { data, error } = useGetTripsQuery();
  
  // Si le token expire pendant la requête
  // Il sera rafraîchi et la requête sera refaite
  
  return <TripsList trips={data} />;
}
```

## ✅ Checklist d'implémentation

- [x] Service de rafraîchissement des tokens
- [x] Endpoint API de refresh token
- [x] Gestion automatique dans baseApi
- [x] Initialisation avec validation
- [x] AuthGuard pour protection des routes
- [x] Gestion des erreurs 401
- [x] Nettoyage à la déconnexion
- [x] Protection contre rafraîchissements multiples
- [x] Logs de debugging
- [ ] Tests unitaires
- [ ] Tests d'intégration
- [ ] Documentation backend

---

**Status** : ✅ Implémenté et fonctionnel
**Version** : 1.0.0
**Date** : 12 novembre 2025

