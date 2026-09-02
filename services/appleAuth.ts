import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type AppleAuthResult = {
  identityToken: string;
  nonce: string;
  userIdentifier: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

type CachedAppleProfile = {
  userIdentifier: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

const APPLE_PROFILE_CACHE_KEY = 'zwanga.apple-auth-profile.v1';

const normalizeNamePart = (value?: string | null): string | null => {
  const normalized = String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  return normalized || null;
};

const readCachedAppleProfile = async (
  userIdentifier: string,
): Promise<CachedAppleProfile | null> => {
  try {
    const rawProfile = await SecureStore.getItemAsync(APPLE_PROFILE_CACHE_KEY);
    if (!rawProfile) return null;

    const profile = JSON.parse(rawProfile) as Partial<CachedAppleProfile>;
    return profile.userIdentifier === userIdentifier
      ? {
          userIdentifier,
          firstName: normalizeNamePart(profile.firstName),
          lastName: normalizeNamePart(profile.lastName),
          email: normalizeNamePart(profile.email),
        }
      : null;
  } catch (error) {
    console.warn('[AppleAuth] Lecture du profil Apple impossible:', error);
    return null;
  }
};

const cacheAppleProfile = async (profile: CachedAppleProfile): Promise<void> => {
  try {
    await SecureStore.setItemAsync(APPLE_PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.warn('[AppleAuth] Sauvegarde du profil Apple impossible:', error);
  }
};

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithApple(): Promise<AppleAuthResult> {
  if (!(await isAppleSignInAvailable())) {
    throw new Error('Connexion Apple non disponible sur cet appareil');
  }

  const nonce = Crypto.randomUUID();

  try {
    const credential = await AppleAuthentication.signInAsync({
      nonce,
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      throw new Error('Impossible de récupérer le token Apple');
    }

    const cachedProfile = await readCachedAppleProfile(credential.user);
    const firstName =
      normalizeNamePart(
        [credential.fullName?.givenName, credential.fullName?.middleName]
          .filter(Boolean)
          .join(' '),
      ) ?? cachedProfile?.firstName ?? null;
    const lastName =
      normalizeNamePart(credential.fullName?.familyName) ??
      cachedProfile?.lastName ??
      null;
    const email = normalizeNamePart(credential.email) ?? cachedProfile?.email ?? null;

    if (firstName || lastName || email) {
      await cacheAppleProfile({
        userIdentifier: credential.user,
        firstName,
        lastName,
        email,
      });
    }

    return {
      identityToken: credential.identityToken,
      nonce,
      userIdentifier: credential.user,
      firstName,
      lastName,
      email,
    };
  } catch (error: any) {
    if (error?.code === 'ERR_REQUEST_CANCELED') {
      throw new Error('Connexion annulée par l\'utilisateur');
    }
    if (error?.code === 'ERR_REQUEST_UNKNOWN') {
      throw new Error(
        'Connexion Apple indisponible. Sur simulateur, connectez un compte Apple dans Réglages et utilisez un build signé avec la capacité Sign in with Apple.',
      );
    }
    throw error;
  }
}
