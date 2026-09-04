import { useDialog } from '@/components/ui/DialogProvider';
import { trackEvent } from '@/services/analytics';
import {
  useCreateDiditKycSessionMutation,
  useLazyGetCurrentUserQuery,
  useSyncDiditKycSessionMutation,
} from '@/store/api/userApi';
import type { KycDocument, KycStatus } from '@/types';
import { getEffectiveKycStatus } from '@/utils/kycStatus';
import { hasCompleteLegalIdentity, normalizeLegalName } from '@/utils/legalIdentity';
import type { VerificationResult } from '@didit-protocol/sdk-react-native';
import * as ExpoLinking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const DIDIT_KYC_RETURN_PATH = 'kyc/didit-return';

type QueryParams = Record<string, string | string[] | undefined>;

export type DiditKycFlowOutcome = {
  kyc: KycDocument | null;
  status: KycStatus | null;
  diditStatus?: string | null;
  sessionId?: string | null;
  launchMode?: 'native_sdk' | 'web_browser';
  sdkResultType?: VerificationResult['type'];
  browserResultType?: string;
};

type StartDiditKycOptions = {
  showResultDialog?: boolean;
  skipLegalIdentityConfirmation?: boolean;
};

type UseDiditKycFlowOptions = {
  sourceScreen: string;
  onStatusRefresh?: () => Promise<unknown> | unknown;
  onApproved?: (outcome: DiditKycFlowOutcome) => Promise<unknown> | unknown;
  approvedMessage?: string;
  pendingMessage?: string;
};

type KycFlowStage =
  | 'loading_user'
  | 'confirming_identity'
  | 'creating_session'
  | 'opening_native_sdk'
  | 'opening_web_browser'
  | 'syncing_session'
  | 'refreshing_status'
  | 'handling_result';

type KycErrorCategory =
  | 'interrupted'
  | 'network'
  | 'camera'
  | 'session_expired'
  | 'authentication'
  | 'rate_limited'
  | 'service_unavailable'
  | 'unknown';

type KycErrorPresentation = {
  category: KycErrorCategory;
  code: string;
  title: string;
  message: string;
};

const asStringParam = (params: QueryParams, key: string) => {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const getKycStatusFromDiditStatus = (status?: string | null): KycStatus | null => {
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

const getRawKycErrorMessage = (error: any) => {
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

class KycUserFacingError extends Error {
  constructor(
    readonly presentation: KycErrorPresentation,
    readonly technicalMessage?: string,
  ) {
    super(presentation.message);
    this.name = 'KycUserFacingError';
  }
}

const isKycAbortError = (error: any) => {
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

const getKycErrorPresentation = (
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
      message: 'Le service de validation d’identité est momentanément indisponible. Réessayez plus tard.',
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

const runDiditNativeVerification = async (
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

const getDiditSdkFailureError = (result: VerificationResult) => {
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
          ? 'Le service de validation est momentanément indisponible. Réessayez plus tard.'
          : "La validation d'identité n'a pas pu aboutir. Réessayez plus tard.",
    },
    result.error.message,
  );
};

export function useDiditKycFlow({
  sourceScreen,
  onStatusRefresh,
  onApproved,
  approvedMessage = "Votre identité a été vérifiée avec succès.",
  pendingMessage = 'Votre vérification Didit est en cours. Nous mettrons votre statut à jour dès que Didit confirme la décision.',
}: UseDiditKycFlowOptions) {
  const { showDialog } = useDialog();
  const router = useRouter();
  const [getCurrentUser] = useLazyGetCurrentUserQuery();
  const [createDiditKycSession, { isLoading: isCreatingDiditKycSession }] =
    useCreateDiditKycSessionMutation();
  const [syncDiditKycSession, { isLoading: isSyncingDiditKycSession }] =
    useSyncDiditKycSessionMutation();
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);

  const confirmLegalIdentity = useCallback(
    (firstNameValue?: string | null, lastNameValue?: string | null) => {
      const firstName = normalizeLegalName(firstNameValue);
      const lastName = normalizeLegalName(lastNameValue);

      return new Promise<boolean>((resolve) => {
        const editIdentity = () => {
          resolve(false);
          router.push('/edit-profile');
        };

        if (!hasCompleteLegalIdentity(firstName, lastName)) {
          showDialog({
            variant: 'warning',
            title: 'Noms légaux requis',
            message:
              'Renseignez vos prénom(s) et votre nom exactement comme sur votre pièce d’identité avant de lancer Didit. Le post-nom est facultatif.',
            dismissible: false,
            actions: [
              {
                label: 'Compléter mon profil',
                variant: 'primary',
                onPress: editIdentity,
              },
            ],
          });
          return;
        }

        showDialog({
          variant: 'info',
          icon: 'id-card-outline',
          title: 'Confirmez vos noms légaux',
          message:
            `Prénom(s) : ${firstName}\nNom : ${lastName}\n\n` +
            'Didit comparera ces informations à votre pièce d’identité. Corrigez-les avant de continuer si elles ne sont pas identiques.',
          dismissible: false,
          actions: [
            {
              label: 'Modifier mes noms',
              variant: 'secondary',
              onPress: editIdentity,
            },
            {
              label: 'Confirmer et continuer',
              variant: 'primary',
              onPress: () => resolve(true),
            },
          ],
        });
      });
    },
    [router, showDialog],
  );

  const startDiditKyc = useCallback(
    async ({
      showResultDialog = true,
      skipLegalIdentityConfirmation = false,
    }: StartDiditKycOptions = {}): Promise<DiditKycFlowOutcome | null> => {
      setIsBrowserOpen(true);
      let flowStage: KycFlowStage = 'loading_user';
      let sessionId: string | null = null;
      let launchMode: DiditKycFlowOutcome['launchMode'] = 'native_sdk';

      try {
        if (!skipLegalIdentityConfirmation) {
          flowStage = 'loading_user';
          const currentUser = await getCurrentUser().unwrap();
          flowStage = 'confirming_identity';
          const isConfirmed = await confirmLegalIdentity(
            currentUser.firstName,
            currentUser.lastName,
          );
          if (!isConfirmed) {
            return null;
          }
        }

        flowStage = 'creating_session';
        const callbackUrl = ExpoLinking.createURL(DIDIT_KYC_RETURN_PATH);
        const session = await createDiditKycSession({
          callbackUrl,
          language: 'fr',
          source: sourceScreen,
        }).unwrap();

        if (!session.sessionToken && !session.url) {
          throw new Error("Le backend n'a pas retourne de token SDK ni d'URL Didit.");
        }

        await trackEvent('kyc_didit_session_started', {
          source_screen: sourceScreen,
          didit_session_id: session.sessionId,
          didit_status: session.status,
        });

        sessionId = session.sessionId || null;
        let diditStatus = session.status ?? null;
        let sdkResultType: VerificationResult['type'] | undefined;
        let browserResultType: string | undefined;

        const handleVerificationCancellation = async (cancelledSessionId?: string | null) => {
          await trackEvent('kyc_didit_cancelled', {
            source_screen: sourceScreen,
            didit_session_id: cancelledSessionId ?? sessionId,
          });

          if (showResultDialog) {
            showDialog({
              variant: 'info',
              title: "Validation d'identité interrompue",
              message:
                "Aucune validation n'a été soumise. Vous pourrez reprendre la procédure lorsque vous serez prêt.",
            });
          }
        };

        if (session.sessionToken) {
          try {
            flowStage = 'opening_native_sdk';
            const sdkResult = await runDiditNativeVerification(session.sessionToken);
            sdkResultType = sdkResult.type;

            if (sdkResult.session?.sessionId) {
              sessionId = sdkResult.session.sessionId;
            }

            if (sdkResult.session?.status) {
              diditStatus = sdkResult.session.status;
            }

            if (sdkResult.type === 'cancelled') {
              await handleVerificationCancellation(sdkResult.session?.sessionId);
              return null;
            }

            const failureError = getDiditSdkFailureError(sdkResult);
            if (failureError) {
              throw failureError;
            }
          } catch (sdkError: any) {
            const message = String(sdkError?.message ?? '');
            const lowerMessage = message.toLowerCase();

            const isNativeModuleUnavailable =
              message.includes('SdkReactNative') ||
              message.includes('NativeSdkReactNative') ||
              message.includes('TurboModule') ||
              message.includes('notInitialized') ||
              lowerMessage.includes('cannot find native module') ||
              lowerMessage.includes('native module');

            if (!isNativeModuleUnavailable) {
              throw sdkError;
            }

            console.warn(
              '[DiditKyc] SDK natif indisponible, bascule temporaire vers WebBrowser:',
              sdkError,
            );
            launchMode = 'web_browser';
          }
        } else {
          launchMode = 'web_browser';
        }

        if (launchMode === 'web_browser') {
          flowStage = 'opening_web_browser';
          if (!session.url) {
            throw new Error(
              "Le SDK natif Didit est indisponible et aucune URL de secours n'a ete retournee.",
            );
          }

          const browserResult = await WebBrowser.openAuthSessionAsync(session.url, callbackUrl);
          browserResultType = browserResult.type;

          if (browserResult.type === 'cancel' || browserResult.type === 'dismiss') {
            await handleVerificationCancellation(sessionId);
            return null;
          }

          if (browserResult.type === 'success' && browserResult.url) {
            const parsedUrl = ExpoLinking.parse(browserResult.url);
            const params = (parsedUrl.queryParams ?? {}) as QueryParams;
            sessionId =
              asStringParam(params, 'verificationSessionId') ??
              asStringParam(params, 'session_id') ??
              asStringParam(params, 'sessionId') ??
              sessionId;
            diditStatus = asStringParam(params, 'status') ?? diditStatus;
          }
        }

        flowStage = 'syncing_session';
        const kyc = await syncDiditKycSession({
          sessionId,
          status: diditStatus,
        }).unwrap();

        flowStage = 'refreshing_status';
        await onStatusRefresh?.();

        flowStage = 'handling_result';
        const status = getEffectiveKycStatus(kyc) ?? getKycStatusFromDiditStatus(diditStatus);
        const outcome: DiditKycFlowOutcome = {
          kyc,
          status,
          diditStatus,
          sessionId,
          launchMode,
          sdkResultType,
          browserResultType,
        };

        if (status === 'approved') {
          await trackEvent('kyc_didit_approved', {
            source_screen: sourceScreen,
            didit_session_id: sessionId,
          });
          await onApproved?.(outcome);
        }

        if (showResultDialog) {
          if (status === 'approved') {
            showDialog({
              variant: 'success',
              title: 'KYC validé avec succès !',
              message: approvedMessage,
            });
          } else if (status === 'rejected') {
            showDialog({
              variant: 'danger',
              title: 'KYC rejeté',
              message:
                kyc?.rejectionReason ||
                "Didit n'a pas pu valider votre identité. Vous pouvez relancer la vérification.",
            });
          } else if (status === 'pending') {
            showDialog({
              variant: 'success',
              title: 'Vérification Didit lancée',
              message: pendingMessage,
            });
          } else {
            showDialog({
              variant: 'info',
              title: "Validation d'identité interrompue",
              message:
                "Aucune validation n'a été soumise. Vous pourrez reprendre la procédure lorsque vous serez prêt.",
            });
          }
        }

        return outcome;
      } catch (error: any) {
        const presentation = getKycErrorPresentation(error, flowStage);
        const rawMessage =
          error instanceof KycUserFacingError
            ? error.technicalMessage || error.message
            : getRawKycErrorMessage(error);
        const isDevelopmentBuild = typeof __DEV__ !== 'undefined' && __DEV__;

        if (isDevelopmentBuild) {
          console.error('[KycFlow] Échec de la validation', {
            category: presentation.category,
            code: presentation.code,
            stage: flowStage,
            platform: Platform.OS,
            sourceScreen,
            launchMode,
            sessionId,
            errorName: error?.name,
            errorCode: error?.code,
            errorStatus: error?.status ?? error?.data?.statusCode,
            rawMessage,
            stack: error?.stack,
          });
        }

        void trackEvent('kyc_didit_error', {
          source_screen: sourceScreen,
          error_category: presentation.category,
          error_code: presentation.code,
          flow_stage: flowStage,
          launch_mode: launchMode,
          platform: Platform.OS,
        });

        showDialog({
          variant: presentation.category === 'interrupted' ? 'info' : 'danger',
          title: presentation.title,
          message:
            presentation.message +
            (isDevelopmentBuild ? `\n\nCode diagnostic : ${presentation.code}` : ''),
        });
        return null;
      } finally {
        setIsBrowserOpen(false);
      }
    },
    [
      approvedMessage,
      confirmLegalIdentity,
      createDiditKycSession,
      getCurrentUser,
      onApproved,
      onStatusRefresh,
      pendingMessage,
      showDialog,
      sourceScreen,
      syncDiditKycSession,
    ],
  );

  return {
    startDiditKyc,
    isStartingDiditKyc:
      isCreatingDiditKycSession || isSyncingDiditKycSession || isBrowserOpen,
  };
}
