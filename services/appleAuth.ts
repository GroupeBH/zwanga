import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

export type AppleAuthResult = {
  identityToken: string;
  nonce: string;
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
    const credential = await AppleAuthentication.signInAsync({ nonce });

    if (!credential.identityToken) {
      throw new Error('Impossible de récupérer le token Apple');
    }

    return {
      identityToken: credential.identityToken,
      nonce,
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
