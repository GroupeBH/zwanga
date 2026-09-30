import {
  GoogleSignin,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';
import { GoogleAuthError, normalizeGoogleAuthError } from '@/features/auth/googleAuthErrors';

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

let configured = false;
let interactiveSignIn: Promise<GoogleAuthResult> | null = null;

// Idempotent, including remounts of the authentication screen.
export function configureGoogleSignIn() {
  if (configured) return;
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
  configured = true;
}

// Share the actual native operation, not a timer. Never unlock while Google's UI
// is still pending: launching another signIn can reject the first native promise.
export function signInWithGoogle(): Promise<GoogleAuthResult> {
  if (interactiveSignIn) return interactiveSignIn;
  const attempt = performGoogleSignIn();
  interactiveSignIn = attempt;
  const release = () => { if (interactiveSignIn === attempt) interactiveSignIn = null; };
  void attempt.then(release, release);
  return attempt;
}

async function performGoogleSignIn(): Promise<GoogleAuthResult> {
  try {
    // The installed SDK itself waits for its native configuration promise.
    configureGoogleSignIn();
    // Check if Play Services are available (Android only)
    const available = await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    if (!available) throw new GoogleAuthError('services_unavailable');

    // Trigger the native Google Sign-In UI
    const response = await GoogleSignin.signIn();

    if (response.type === 'cancelled') throw new GoogleAuthError('cancelled');
    if (!isSuccessResponse(response)) throw new GoogleAuthError('unavailable');

    const { data } = response;
    const idToken = data.idToken;

    if (!idToken) {
      throw new GoogleAuthError('missing_token');
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
    throw normalizeGoogleAuthError(error, statusCodes);
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
    configureGoogleSignIn();
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
