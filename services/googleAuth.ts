import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

export type GoogleAuthResult = {
  idToken: string;
  email?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
};

const FALLBACK_GOOGLE_WEB_CLIENT_ID =
  '754065251959-scmvdlel13lf7kpbg3tdmevl7hj0299s.apps.googleusercontent.com';
const FALLBACK_GOOGLE_IOS_CLIENT_ID =
  '754065251959-chelbj9aa06c2ifbpnmcot2mt6p61rkp.apps.googleusercontent.com';

// Configure Google Sign-In (call this once at app startup)
export function configureGoogleSignIn() {
  const extra =
    ((Constants.expoConfig?.extra ?? Constants.manifest2?.extra) as Record<string, string | undefined> | undefined) ??
    {};

  const webClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    extra.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    FALLBACK_GOOGLE_WEB_CLIENT_ID;
  const iosClientId =
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    extra.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    FALLBACK_GOOGLE_IOS_CLIENT_ID;

  if (!webClientId) {
    throw new Error('Google Sign-In non configure: webClientId manquant');
  }

  GoogleSignin.configure({
    webClientId, // Required for getting idToken
    iosClientId, // iOS specific client ID
    offlineAccess: false,
    scopes: ['profile', 'email'],
  });
}

// Sign in with Google and return user info + idToken
export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  try {
    // Check if Play Services are available (Android only)
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Trigger the native Google Sign-In UI
    const response = await GoogleSignin.signIn();

    if (!isSuccessResponse(response)) {
      throw new Error('Connexion Google annulée');
    }

    const { data } = response;
    const idToken = data.idToken;

    if (!idToken) {
      throw new Error('Impossible de récupérer le token Google');
    }

    return {
      idToken,
      email: data.user.email,
      name: data.user.name ?? undefined,
      givenName: data.user.givenName ?? undefined,
      familyName: data.user.familyName ?? undefined,
      picture: data.user.photo ?? undefined,
    };
  } catch (error) {
    if (isErrorWithCode(error)) {
      switch (error.code) {
        case statusCodes.SIGN_IN_CANCELLED:
          throw new Error('Connexion annulée par l\'utilisateur');
        case statusCodes.IN_PROGRESS:
          throw new Error('Connexion déjà en cours');
        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          throw new Error('Google Play Services non disponible');
        default:
          throw new Error(`Erreur Google Sign-In: ${error.message}`);
      }
    }
    throw error;
  }
}

// Sign out from Google
export async function signOutFromGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch (error) {
    console.warn('Google sign out error:', error);
  }
}

// Check if user is currently signed in with Google
export async function isGoogleSignedIn(): Promise<boolean> {
  return GoogleSignin.hasPreviousSignIn();
}

// Get current user info without prompting sign-in
export async function getCurrentGoogleUser(): Promise<GoogleAuthResult | null> {
  try {
    const response = await GoogleSignin.signInSilently();
    
    if (response.type !== 'success') {
      return null;
    }

    const { data } = response;
    const idToken = data.idToken;

    if (!idToken) {
      return null;
    }

    return {
      idToken,
      email: data.user.email,
      name: data.user.name ?? undefined,
      givenName: data.user.givenName ?? undefined,
      familyName: data.user.familyName ?? undefined,
      picture: data.user.photo ?? undefined,
    };
  } catch {
    return null;
  }
}
