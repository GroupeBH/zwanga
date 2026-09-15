import type { KycStatus } from '@/types';
import { KycErrorPresentation, KycFlowStage, QueryParams } from './diditFlowTypes';

export const asStringParam = (params: QueryParams, key: string) => {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

export const getKycStatusFromDiditStatus = (status?: string | null): KycStatus | null => {
  const normalized = String(status ?? '').trim().toLowerCase();

  if (normalized === 'approved') {
    return 'approved';
  }

  if (
    normalized === 'declined' ||
    normalized === 'expired' ||
    normalized === 'abandoned' ||
    normalized === 'kyc expired'
  ) {
    return 'rejected';
  }

  if (
    normalized === 'in review' ||
    normalized === 'in progress' ||
    normalized === 'resubmitted' ||
    normalized === 'awaiting user'
  ) {
    return 'pending';
  }

  return null;
};

export const getRawKycErrorMessage = (error: any) => {
  const message =
    error?.data?.message ??
    error?.data?.error?.message ??
    error?.data?.error ??
    error?.error?.message ??
    error?.error ??
    error?.message ??
    '';

  return Array.isArray(message) ? message.join('\n') : String(message);
};

export class KycUserFacingError extends Error {
  constructor(
    readonly presentation: KycErrorPresentation,
    readonly technicalMessage?: string,
  ) {
    super(presentation.message);
    this.name = 'KycUserFacingError';
  }
}

export const isKycAbortError = (error: any) => {
  const errorDetails = [
    error?.name,
    error?.code,
    error?.type,
    getRawKycErrorMessage(error),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    errorDetails.includes('aborterror') ||
    errorDetails.includes('aborted') ||
    errorDetails.includes('cancelled') ||
    errorDetails.includes('canceled')
  );
};

export const getKycErrorPresentation = (
  error: any,
  stage: KycFlowStage,
): KycErrorPresentation => {
  const message = getRawKycErrorMessage(error).trim();
  const errorDetails = [error?.name, error?.code, error?.type, message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const status = Number(error?.status ?? error?.data?.statusCode);

  if (error instanceof KycUserFacingError) {
    return error.presentation;
  }

  if (
    errorDetails.includes('cameraaccessdenied') ||
    (errorDetails.includes('camera') &&
      (errorDetails.includes('denied') || errorDetails.includes('permission')))
  ) {
    return {
      category: 'camera',
      code: 'KYC_CAMERA_ACCESS_DENIED',
      title: 'Caméra inaccessible',
      message:
        "Autorisez l'accès à la caméra dans les réglages du téléphone, puis relancez la validation.",
    };
  }

  if (
    errorDetails.includes('sessionexpired') ||
    errorDetails.includes('session expired') ||
    errorDetails.includes('expired_token')
  ) {
    return {
      category: 'session_expired',
      code: 'KYC_SESSION_EXPIRED',
      title: 'Session expirée',
      message: 'Cette session de validation a expiré. Relancez la procédure pour en créer une nouvelle.',
    };
  }

  if (errorDetails.includes('retryblocked') || status === 429) {
    return {
      category: 'rate_limited',
      code: 'KYC_RETRY_BLOCKED',
      title: 'Trop de tentatives',
      message: 'Patientez quelques instants avant de relancer la validation.',
    };
  }

  if (status === 401 || status === 403) {
    return {
      category: 'authentication',
      code: 'KYC_AUTH_REQUIRED',
      title: 'Session Zwanga expirée',
      message: 'Reconnectez-vous à Zwanga, puis relancez la validation d’identité.',
    };
  }

  if (isKycAbortError(error)) {
    if (stage === 'creating_session' || stage === 'loading_user') {
      return {
        category: 'network',
        code: 'KYC_SESSION_REQUEST_ABORTED',
        title: 'Connexion interrompue',
        message:
          "La demande d'ouverture n'a pas pu atteindre le serveur. Vérifiez votre connexion, puis réessayez.",
      };
    }

    if (stage === 'opening_native_sdk') {
      return {
        category: 'interrupted',
        code: 'KYC_NATIVE_OPEN_ABORTED',
        title: 'Ouverture interrompue',
        message:
          "L'écran de validation s'est fermé avant de démarrer. Réessayez et, si le problème persiste, redémarrez l'application.",
      };
    }

    if (stage === 'opening_web_browser') {
      return {
        category: 'interrupted',
        code: 'KYC_BROWSER_OPEN_ABORTED',
        title: 'Fenêtre de validation interrompue',
        message:
          'La fenêtre sécurisée n’a pas pu rester ouverte. Fermez toute autre fenêtre de validation, puis réessayez.',
      };
    }

    if (stage === 'syncing_session' || stage === 'refreshing_status') {
      return {
        category: 'network',
        code: 'KYC_STATUS_SYNC_ABORTED',
        title: 'Mise à jour interrompue',
        message:
          'La validation a peut-être été envoyée, mais son statut n’a pas pu être récupéré. Actualisez votre profil dans quelques instants.',
      };
    }

    return {
      category: 'interrupted',
      code: 'KYC_FLOW_ABORTED',
      title: 'Validation interrompue',
      message: 'La validation a été interrompue avant sa fin. Vous pouvez la relancer.',
    };
  }

  if (
    errorDetails.includes('network') ||
    errorDetails.includes('failed to fetch') ||
    errorDetails.includes('timeout') ||
    errorDetails.includes('timed out') ||
    error?.status === 'FETCH_ERROR' ||
    error?.status === 'TIMEOUT_ERROR'
  ) {
    return {
      category: 'network',
      code: stage === 'syncing_session' ? 'KYC_SYNC_NETWORK_ERROR' : 'KYC_NETWORK_ERROR',
      title: 'Connexion impossible',
      message:
        stage === 'syncing_session'
          ? 'Le statut de votre validation n’a pas pu être récupéré. Vérifiez votre connexion et actualisez votre profil.'
          : 'Le service de validation est inaccessible. Vérifiez votre connexion Internet, puis réessayez.',
    };
  }

  if (
    status === 404 ||
    status >= 500 ||
    errorDetails.includes('not found') ||
    errorDetails.includes('apierror') ||
    errorDetails.includes('notinitialized') ||
    errorDetails.includes('service unavailable')
  ) {
    return {
      category: 'service_unavailable',
      code: status === 404 ? 'KYC_SERVICE_NOT_FOUND' : 'KYC_SERVICE_UNAVAILABLE',
      title: 'Service indisponible',
      message: "Le service de vérification d'identité est temporairement indisponible. Réessayez dans quelques instants.",
    };
  }

  const stageDefaults: Partial<Record<KycFlowStage, KycErrorPresentation>> = {
    creating_session: {
      category: 'service_unavailable',
      code: 'KYC_SESSION_CREATION_FAILED',
      title: 'Création impossible',
      message: 'La session de validation n’a pas pu être créée. Réessayez dans quelques instants.',
    },
    opening_native_sdk: {
      category: 'service_unavailable',
      code: 'KYC_NATIVE_OPEN_FAILED',
      title: 'Ouverture impossible',
      message: "L'écran de validation n'a pas pu s'ouvrir. Fermez puis relancez l'application avant de réessayer.",
    },
    opening_web_browser: {
      category: 'service_unavailable',
      code: 'KYC_BROWSER_OPEN_FAILED',
      title: 'Ouverture impossible',
      message: 'La fenêtre sécurisée de validation n’a pas pu s’ouvrir. Réessayez dans quelques instants.',
    },
    syncing_session: {
      category: 'service_unavailable',
      code: 'KYC_STATUS_SYNC_FAILED',
      title: 'Statut indisponible',
      message: 'Le statut de votre validation n’a pas pu être récupéré. Actualisez votre profil plus tard.',
    },
  };

  return (
    stageDefaults[stage] ?? {
      category: 'unknown',
      code: 'KYC_UNKNOWN_ERROR',
      title: 'Validation indisponible',
      message: "La validation d'identité n'a pas pu aboutir. Réessayez plus tard.",
    }
  );
};
