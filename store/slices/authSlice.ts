import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { validateAndRefreshTokens } from '../../services/tokenRefresh';
import { clearTokens, getTokens } from '../../services/tokenStorage';
import type { User } from '../../types';
import { decodeJWT } from '../../utils/jwt';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenPayload: any | null; // Payload décodé du JWT
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  accessToken: null,
  refreshToken: null,
  tokenPayload: null,
};

/**
 * Thunk pour initialiser l'authentification depuis SecureStore
 * Vérifie et rafraîchit les tokens si nécessaire
 * Retourne null si l'utilisateur n'est pas connecté (pas de tokens ou tokens expirés)
 */
export const initializeAuth = createAsyncThunk(
  'auth/initialize',
  async () => {
    try {
      // Valider et rafraîchir les tokens si nécessaire
      const isAuthenticated = await validateAndRefreshTokens();
      
      if (!isAuthenticated) {
        console.log('Utilisateur non authentifié - aucun token valide');
        return null;
      }
      
      // Récupérer les tokens (potentiellement rafraîchis)
      const { accessToken, refreshToken } = await getTokens();
      
      if (!accessToken || !refreshToken) {
        return null;
      }
      
      // Décoder le payload du token
      const payload = decodeJWT(accessToken);
      console.log("payload at initializeAuth", payload);
      
      if (!payload) {
        console.warn('[initializeAuth] Token JWT invalide - mais on garde les tokens pour éviter la déconnexion');
        // NE PAS supprimer les tokens - ils pourraient être valides mais juste mal décodés
        // L'utilisateur pourra toujours utiliser l'app, même si certaines infos ne sont pas disponibles
        // Les tokens seront validés lors de la prochaine requête API
        return {
          accessToken,
          refreshToken,
          tokenPayload: null,
          userInfo: null,
        };
      }
      
      console.log('[initializeAuth] Authentification initialisée avec succès');
      
      return {
        accessToken,
        refreshToken,
        tokenPayload: payload,
        userInfo: parseUserInfo(payload),
      };
    } catch (error: any) {
      // En cas d'erreur, NE PAS supprimer les tokens automatiquement
      // Cela pourrait être une erreur temporaire (réseau, etc.)
      console.error('[initializeAuth] Erreur lors de l\'initialisation de l\'auth:', error);
      console.warn('[initializeAuth] Erreur non critique - les tokens sont conservés dans SecureStore');
      // Retourner null mais NE PAS supprimer les tokens
      // L'utilisateur pourra toujours se reconnecter avec ses tokens existants
      return null;
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<any>) => {
      state.user = action.payload;
      // Ne mettre isAuthenticated = true que si on a des tokens
      // Cela évite les problèmes de timing où setUser est appelé avant setTokens
      state.isAuthenticated = !!(state.accessToken && state.refreshToken);
      state.error = null;
    },
    setTokens: (state, action: PayloadAction<{ accessToken: string; refreshToken: string }>) => {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      
      // Décoder le payload du token
      applyTokenDataToState(state, action.payload.accessToken);
    },
    setAccessToken: (state, action: PayloadAction<string>) => {
      state.accessToken = action.payload;
      applyTokenDataToState(state, action.payload);
    },
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      }
    },
    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.accessToken = null;
      state.refreshToken = null;
      state.tokenPayload = null;
      state.error = null;
      // Nettoyer SecureStore
      clearTokens().catch(console.error);
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeAuth.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload) {
          state.accessToken = action.payload.accessToken;
          state.refreshToken = action.payload.refreshToken;
          state.tokenPayload = action.payload.tokenPayload;
          state.isAuthenticated = true;
          
          // Si on a des infos utilisateur dans le token, on peut les utiliser
          if (action.payload.userInfo){
            const user = action.payload.userInfo;
            console.log("user from token", user);
            if (user) {
              state.user = user;
            }
          }
        } else {
          state.isAuthenticated = false;
        }
      })
      .addCase(initializeAuth.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Erreur lors de l\'initialisation';
        state.isAuthenticated = false;
      });
  },
});

export const {
  setUser,
  setTokens,
  setAccessToken,
  updateUser,
  logout,
  setLoading,
  setError,
  clearError,
} = authSlice.actions;

export default authSlice.reducer;

function parseUserInfo(payload: any): any | null {
  if (!payload) {
    return null;
  }
  return {
    id: payload.sub,
    phone: payload.phone,
    role: (payload.role as User['role']),
    status: payload.status,
    iat: payload.iat ?? 0,
    exp: payload.exp ?? 0,
  };
}

function applyTokenDataToState(state: AuthState, accessToken: string) {
  const payload = decodeJWT(accessToken);
  state.tokenPayload = payload;
  const user = parseUserInfo(payload);
  console.log("user from token", user);
  if (user) {
    state.user = user;
  }
  state.isAuthenticated = true;
  state.error = null;
}

