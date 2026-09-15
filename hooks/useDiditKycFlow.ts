import { runDiditNativeVerification, getDiditSdkFailureError } from '../features/identity/diditSdk';

export type { DiditKycFlowOutcome } from '@/features/identity/diditFlowTypes';
import { asStringParam, getKycStatusFromDiditStatus, getRawKycErrorMessage, KycUserFacingError, getKycErrorPresentation } from '../features/identity/diditErrors';
import { QueryParams, DiditKycFlowOutcome, StartDiditKycOptions, UseDiditKycFlowOptions, KycFlowStage } from '../features/identity/diditFlowTypes';
import { useDialog } from '@/components/ui/DialogProvider';
import { trackEvent } from '@/services/analytics';
import { useCreateDiditKycSessionMutation, useLazyGetCurrentUserQuery, useSyncDiditKycSessionMutation } from '@/store/api/userApi';

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
          throw new Error("Le backend n'a pas retourné de token SDK ni d'URL Didit.");
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
              "Le SDK natif Didit est indisponible et aucune URL de secours n'a été retournée.",
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
              title: 'Identité vérifiée !',
              message: approvedMessage,
            });
          } else if (status === 'rejected') {
            showDialog({
              variant: 'danger',
              title: 'Vérification non validée',
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
