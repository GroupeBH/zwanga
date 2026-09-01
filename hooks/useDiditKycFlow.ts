import { useDialog } from '@/components/ui/DialogProvider';
import { trackEvent } from '@/services/analytics';
import {
  useCreateDiditKycSessionMutation,
  useSyncDiditKycSessionMutation,
} from '@/store/api/userApi';
import type { KycDocument, KycStatus } from '@/types';
import type { VerificationResult } from '@didit-protocol/sdk-react-native';
import * as ExpoLinking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';

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
};

type UseDiditKycFlowOptions = {
  sourceScreen: string;
  onStatusRefresh?: () => Promise<unknown> | unknown;
  onApproved?: (outcome: DiditKycFlowOutcome) => Promise<unknown> | unknown;
  approvedMessage?: string;
  pendingMessage?: string;
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
    normalized === 'not started' ||
    normalized === 'resubmitted' ||
    normalized === 'awaiting user'
  ) {
    return 'pending';
  }

  return null;
};

const getKycErrorMessage = (error: any) => {
  const message =
    error?.data?.message ??
    error?.data?.error ??
    error?.error ??
    error?.message ??
    "Impossible de lancer la vérification d'identité.";

  return Array.isArray(message) ? message.join('\n') : String(message);
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

const getDiditSdkFailureMessage = (result: VerificationResult) => {
  if (result.type !== 'failed') {
    return null;
  }

  if (result.error.type === 'cameraAccessDenied') {
    return "L'acces a la camera est necessaire pour comparer votre piece d'identite avec votre visage.";
  }

  if (result.error.type === 'sessionExpired') {
    return 'La session KYC Didit a expire. Relancez la verification.';
  }

  if (result.error.type === 'networkError') {
    return 'Connexion reseau indisponible pendant la verification Didit. Reessayez avec une connexion stable.';
  }

  return result.error.message || 'La verification Didit a echoue.';
};

export function useDiditKycFlow({
  sourceScreen,
  onStatusRefresh,
  onApproved,
  approvedMessage = "Votre identité a été vérifiée avec succès.",
  pendingMessage = 'Votre vérification Didit est en cours. Nous mettrons votre statut à jour dès que Didit confirme la décision.',
}: UseDiditKycFlowOptions) {
  const { showDialog } = useDialog();
  const [createDiditKycSession, { isLoading: isCreatingDiditKycSession }] =
    useCreateDiditKycSessionMutation();
  const [syncDiditKycSession, { isLoading: isSyncingDiditKycSession }] =
    useSyncDiditKycSessionMutation();
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);

  const startDiditKyc = useCallback(
    async ({
      showResultDialog = true,
    }: StartDiditKycOptions = {}): Promise<DiditKycFlowOutcome | null> => {
      setIsBrowserOpen(true);

      try {
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

        let sessionId = session.sessionId || null;
        let diditStatus = session.status ?? null;
        let launchMode: DiditKycFlowOutcome['launchMode'] = 'native_sdk';
        let sdkResultType: VerificationResult['type'] | undefined;
        let browserResultType: string | undefined;

        if (session.sessionToken) {
          try {
            const sdkResult = await runDiditNativeVerification(session.sessionToken);
            sdkResultType = sdkResult.type;

            if (sdkResult.session?.sessionId) {
              sessionId = sdkResult.session.sessionId;
            }

            if (sdkResult.session?.status) {
              diditStatus = sdkResult.session.status;
            }

            const failureMessage = getDiditSdkFailureMessage(sdkResult);
            if (failureMessage) {
              throw new Error(failureMessage);
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
          if (!session.url) {
            throw new Error(
              "Le SDK natif Didit est indisponible et aucune URL de secours n'a ete retournee.",
            );
          }

          const browserResult = await WebBrowser.openAuthSessionAsync(session.url, callbackUrl);
          browserResultType = browserResult.type;

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

        const kyc = await syncDiditKycSession({
          sessionId,
          status: diditStatus,
        }).unwrap();

        await onStatusRefresh?.();

        const status = kyc?.status ?? getKycStatusFromDiditStatus(diditStatus);
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
          } else {
            showDialog({
              variant: 'success',
              title: 'Vérification Didit lancée',
              message: pendingMessage,
            });
          }
        }

        return outcome;
      } catch (error: any) {
        showDialog({
          variant: 'danger',
          title: 'Erreur KYC Didit',
          message: getKycErrorMessage(error),
        });
        return null;
      } finally {
        setIsBrowserOpen(false);
      }
    },
    [
      approvedMessage,
      createDiditKycSession,
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
