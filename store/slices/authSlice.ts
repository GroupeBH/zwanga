import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import type { User } from '../../types';
import { storeTokens, clearTokens, getTokens } from '../../services/tokenStorage';
import { decodeJWT, getUserInfoFromToken } from '../../utils/jwt';

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
 * Retourne null si l'utilisateur n'est pas connecté (pas de tokens)
 */
export const initializeAuth = createAsyncThunk(
  'auth/initialize',
  async () => {
    try {
      const { accessToken, refreshToken } = await getTokens();
      
      // Si aucun token n'existe, l'utilisateur n'est pas connecté
      if (!accessToken) {
        return null;
      }
      
      // Décoder le payload du token
      const payload = decodeJWT(accessToken);
      
      // Si le token est invalide ou expiré, ne pas initialiser l'auth
      if (!payload) {
        console.warn('Token JWT invalide lors de l\'initialisation');
        return null;
      }
      
      const userInfo = getUserInfoFromToken(accessToken);
      
      return {
        accessToken,
        refreshToken,
        tokenPayload: payload,
        userInfo,
      };
    } catch (error: any) {
      // En cas d'erreur, considérer que l'utilisateur n'est pas connecté
      // Ne pas logger les erreurs liées à l'absence de tokens (c'est normal)
      if (!error?.message?.includes('Invalid key') && !error?.message?.includes('not found')) {
        console.error('Erreur lors de l\'initialisation de l\'auth:', error);
      }
      return null;
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
      state.error = null;
    },
    setTokens: (state, action: PayloadAction<{ accessToken: string; refreshToken: string }>) => {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      
      // Décoder le payload du token
      const payload = decodeJWT(action.payload.accessToken);
      state.tokenPayload = payload;
      
      state.isAuthenticated = true;
      state.error = null;
    },
    setAccessToken: (state, action: PayloadAction<string>) => {
      state.accessToken = action.payload;
      
      // Décoder le payload du token
      const payload = decodeJWT(action.payload);
      state.tokenPayload = payload;
      
      state.isAuthenticated = true;
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
          if (action.payload.userInfo) {
            // Note: Le user complet devrait être récupéré via une requête API
            // Ici on utilise juste les infos du token comme placeholder
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

