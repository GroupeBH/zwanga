import { runDiditNativeVerification, getDiditSdkFailureError } from '../features/identity/diditSdk';
import { useKycFlowScope } from './identity/useKycFlowScope';
import { clearDiditRecovery, readDiditRecovery, saveDiditRecovery } from '@/services/diditSessionRecovery';
import { isSafeDiditHostedUrl } from '@/features/identity/diditLaunchPolicy';

import { asStringParam, getRawKycErrorMessage, KycUserFacingError, getKycErrorPresentation } from '../features/identity/diditErrors';
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
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type { DiditKycFlowOutcome } from '@/features/identity/diditFlowTypes';

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
  const flowInProgress = useRef(false);
  const confirmation = useRef<((confirmed: boolean) => void) | null>(null);
  const cancelConfirmation = useCallback(() => { confirmation.current?.(false); confirmation.current = null; }, []);
  const captureScope = useKycFlowScope(cancelConfirmation);

  const confirmLegalIdentity = useCallback(
    (firstNameValue?: string | null, lastNameValue?: string | null) => {
      const firstName = normalizeLegalName(firstNameValue);
      const lastName = normalizeLegalName(lastNameValue);

      return new Promise<boolean>((resolve) => {
        const scope = captureScope();
        const finish = (confirmed: boolean) => { confirmation.current = null; resolve(confirmed); };
        confirmation.current = finish;
        const editIdentity = () => {
          finish(false);
          if (scope.canLaunch()) router.push('/edit-profile');
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
              onPress: () => finish(scope.canLaunch()),
            },
          ],
        });
      });
    },
    [captureScope, router, showDialog],
  );

  const startDiditKyc = useCallback(
    async ({
      showResultDialog = true,
      skipLegalIdentityConfirmation = false,
    }: StartDiditKycOptions = {}): Promise<DiditKycFlowOutcome | null> => {
      // State updates do not protect against two taps in the same render.
      const scope = captureScope();
      if (flowInProgress.current || !scope.canLaunch()) return null;
      flowInProgress.current = true;
      setIsBrowserOpen(true);
      let flowStage: KycFlowStage = 'loading_user';
      let sessionId: string | null = null;
      let launchMode: DiditKycFlowOutcome['launchMode'] = 'native_sdk';
      let recoveryUserId: string | null = null;

      try {
        const currentUser = await getCurrentUser().unwrap();
        if (!scope.canLaunch()) return null;
        recoveryUserId = currentUser.id;
        if (!recoveryUserId) throw new Error('Compte introuvable pour reprendre la vérification.');
        if (!skipLegalIdentityConfirmation) {
          flowStage = 'loading_user';
          flowStage = 'confirming_identity';
          const isConfirmed = await confirmLegalIdentity(
            currentUser.firstName,
            currentUser.lastName,
          );
          if (!isConfirmed || !scope.canLaunch()) {
            return null;
          }
        }

        // A previous SDK submission may have succeeded while its sync reply was
        // lost. Ask the backend first, including after process death/remount.
        // Failure here must not create another paid verification session.
        flowStage = 'syncing_session';
        const existing = await syncDiditKycSession({}).unwrap();
        if (!scope.canLaunch()) return null;
        const recovery = await readDiditRecovery(recoveryUserId);
        if (!scope.canLaunch()) return null;
        const existingStatus = getEffectiveKycStatus(existing);
        const sameSession = recovery?.session.sessionId === existing?.diditSessionId;
        const needsUser = existing?.provider === 'didit' &&
          ['not started', 'in progress', 'resubmitted', 'awaiting user'].includes(String(existing.diditSessionStatus).trim().toLowerCase());
        const submittedAwaitingDecision = sameSession && recovery?.submitted && existing?.status === 'pending' &&
          existing.diditSessionStatus !== 'Resubmitted';
        if (existingStatus === 'approved' || submittedAwaitingDecision || (existingStatus === 'pending' && !needsUser)) {
          if (existingStatus === 'approved') {
            try { await clearDiditRecovery(recoveryUserId); } catch { /* The confirmed state is authoritative. */ }
          }
          const outcome: DiditKycFlowOutcome = { kyc: existing, status: existingStatus === 'approved' ? 'approved' : 'pending',
            sessionId: existing?.diditSessionId ?? null, diditStatus: existing?.diditSessionStatus };
          try { await onStatusRefresh?.(); } catch { /* The confirmed decision remains valid. */ }
          if (!scope.current()) return null;
          if (existingStatus === 'approved' && scope.canLaunch()) await onApproved?.(outcome);
          if (showResultDialog && scope.canLaunch()) showDialog({
            variant: existingStatus === 'approved' ? 'success' : 'info',
            title: existingStatus === 'approved' ? 'Identité vérifiée !' : 'Vérification déjà en cours',
            message: existingStatus === 'approved' ? approvedMessage : pendingMessage,
          });
          return outcome;
        }

        flowStage = 'creating_session';
        const callbackUrl = ExpoLinking.createURL(DIDIT_KYC_RETURN_PATH);
        const session = sameSession && recovery && !recovery.submitted &&
          recovery.launchUntil > Date.now() && existing?.status === 'pending' ? recovery.session : await createDiditKycSession({
          callbackUrl,
          language: 'fr',
          source: sourceScreen,
        }).unwrap();
        if (!scope.canLaunch()) return null;
        await saveDiditRecovery(recoveryUserId, session);
        if (!scope.canLaunch()) return null;

        const hosted = session.launchMode === 'hosted';
        if (Platform.OS !== 'web' && !hosted && !session.sessionToken?.trim()) {
          throw new KycUserFacingError({
            category: 'service_unavailable',
            code: 'KYC_SDK_TOKEN_MISSING',
            title: 'Validation indisponible',
            message: "Le service n’a pas fourni de session pour la validation dans l’application. Réessayez plus tard ou contactez le support.",
          });
        }
        if (!session.sessionToken && !session.url) {
          throw new Error("Le backend n'a pas retourné de token SDK ni d'URL Didit.");
        }

        void trackEvent('kyc_didit_session_started', {
          source_screen: sourceScreen,
          didit_session_id: session.sessionId,
          didit_status: session.status,
        }).catch(() => undefined);

        sessionId = session.sessionId || null;
        let diditStatus = session.status ?? null;
        let sdkResultType: VerificationResult['type'] | undefined;
        let browserResultType: string | undefined;

        const handleVerificationCancellation = async (cancelledSessionId?: string | null) => {
          await trackEvent('kyc_didit_cancelled', {
            source_screen: sourceScreen,
            didit_session_id: cancelledSessionId ?? sessionId,
          });

          if (showResultDialog && scope.canLaunch()) {
            showDialog({
              variant: 'info',
              title: "Validation d'identité interrompue",
              message:
                "Aucune validation n'a été soumise. Vous pourrez reprendre la procédure lorsque vous serez prêt.",
            });
          }
        };

        if (Platform.OS !== 'web' && !hosted && session.sessionToken) {
          try {
            flowStage = 'opening_native_sdk';
            const sdkResult = await runDiditNativeVerification(session.sessionToken);
            if (!scope.current()) return null;
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

            throw new KycUserFacingError({
              category: 'service_unavailable',
              code: 'KYC_NATIVE_MODULE_UNAVAILABLE',
              title: 'Module de validation indisponible',
              message: "Cette installation ne contient pas le module de vérification requis. Installez la dernière version complète de Zwanga puis réessayez.",
            });
          }
        } else {
          launchMode = 'web_browser';
        }

        if (launchMode === 'web_browser') {
          flowStage = 'opening_web_browser';
          if (!isSafeDiditHostedUrl(session.url)) {
            throw new Error(
              "Le SDK natif Didit est indisponible et aucune URL de secours n'a été retournée.",
            );
          }

          const browserResult = await WebBrowser.openAuthSessionAsync(session.url, callbackUrl);
          if (!scope.current()) return null;
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

        await saveDiditRecovery(recoveryUserId, session, true);
        if (!scope.current()) return null;
        flowStage = 'syncing_session';
        const kyc = await syncDiditKycSession({
          sessionId,
          status: diditStatus,
        }).unwrap();
        if (!scope.current()) return null;

        flowStage = 'refreshing_status';
        try { await onStatusRefresh?.(); } catch { /* Do not turn a confirmed result into a failed verification. */ }
        if (!scope.current()) return null;

        flowStage = 'handling_result';
        // The SDK callback is a sync hint, not the authoritative account state.
        const status = getEffectiveKycStatus(kyc) ?? 'pending';
        if (status === 'approved' || status === 'rejected') {
          try { await clearDiditRecovery(recoveryUserId); } catch { /* Cleanup must not reverse the decision. */ }
        }
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
          if (scope.canLaunch()) await onApproved?.(outcome);
        }

        if (showResultDialog && scope.canLaunch()) {
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
        if (!scope.canLaunch()) return null;
        const presentation = getKycErrorPresentation(error, flowStage);
        if (presentation.category === 'session_expired' && recoveryUserId) {
          try { await clearDiditRecovery(recoveryUserId); } catch { /* Preserve the original error. */ }
        }
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
        flowInProgress.current = false;
        if (scope.canUpdate()) setIsBrowserOpen(false);
      }
    },
    [
      approvedMessage,
      captureScope,
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
