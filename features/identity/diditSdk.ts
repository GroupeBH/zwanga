import type { VerificationResult } from '@didit-protocol/sdk-react-native';
import { KycUserFacingError } from './diditErrors';

export const runDiditNativeVerification = async (
  sessionToken: string,
): Promise<VerificationResult> => {
  const diditSdk = await import('@didit-protocol/sdk-react-native');

  return diditSdk.startVerification(sessionToken, {
    languageCode: 'fr',
    loggingEnabled: typeof __DEV__ !== 'undefined' ? __DEV__ : false,
    showCloseButton: true,
    showExitConfirmation: true,
    closeOnComplete: false,
    defaultDocumentCamera: diditSdk.CameraLens.Back,
    defaultLivenessCamera: diditSdk.CameraLens.Front,
    showDocumentCameraSwitchButton: true,
    showLivenessCameraSwitchButton: false,
  });
};

export const getDiditSdkFailureError = (result: VerificationResult) => {
  if (result.type !== 'failed') {
    return null;
  }

  if (result.error.type === 'cameraAccessDenied') {
    return new KycUserFacingError(
      {
        category: 'camera',
        code: 'KYC_CAMERA_ACCESS_DENIED',
        title: 'Caméra inaccessible',
        message:
          "Autorisez l'accès à la caméra dans les réglages du téléphone, puis relancez la validation.",
      },
      result.error.message,
    );
  }

  if (result.error.type === 'sessionExpired') {
    return new KycUserFacingError(
      {
        category: 'session_expired',
        code: 'KYC_SESSION_EXPIRED',
        title: 'Session expirée',
        message: 'Cette session de validation a expiré. Relancez la procédure pour en créer une nouvelle.',
      },
      result.error.message,
    );
  }

  if (result.error.type === 'networkError') {
    return new KycUserFacingError(
      {
        category: 'network',
        code: 'KYC_SDK_NETWORK_ERROR',
        title: 'Connexion interrompue',
        message: 'La connexion a été perdue pendant la validation. Reconnectez-vous, puis réessayez.',
      },
      result.error.message,
    );
  }

  if (result.error.type === 'retryBlocked') {
    return new KycUserFacingError(
      {
        category: 'rate_limited',
        code: 'KYC_RETRY_BLOCKED',
        title: 'Trop de tentatives',
        message: 'Patientez quelques instants avant de relancer la validation.',
      },
      result.error.message,
    );
  }

  if (result.error.type === 'notInitialized') {
    return new KycUserFacingError(
      {
        category: 'service_unavailable',
        code: 'KYC_SDK_NOT_INITIALIZED',
        title: 'Module de validation indisponible',
        message: "Fermez puis relancez l'application avant de réessayer.",
      },
      result.error.message,
    );
  }

  return new KycUserFacingError(
    {
      category: result.error.type === 'apiError' ? 'service_unavailable' : 'unknown',
      code: result.error.type === 'apiError' ? 'KYC_PROVIDER_API_ERROR' : 'KYC_SDK_UNKNOWN_ERROR',
      title: result.error.type === 'apiError' ? 'Service indisponible' : 'Échec de la validation',
      message:
        result.error.type === 'apiError'
          ? "Le service de vérification d'identité est temporairement indisponible. Réessayez dans quelques instants."
          : "La validation d'identité n'a pas pu aboutir. Réessayez plus tard.",
    },
    result.error.message,
  );
};
