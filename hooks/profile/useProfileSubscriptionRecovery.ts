import { useDialog } from '@/components/ui/DialogProvider';
import {
  buildStoredSubscriptionPaymentFromHistory,
  createCardPaymentRedirectUrls,
  getMostRecentPendingSubscriptionPayment,
  getSubscriptionPaymentStatusMessage,
  StoredSubscriptionPayment,
  SUBSCRIPTION_DEFERRED_BACKEND_SYNC_DELAY_MS
} from '@/features/profile/profileModel';
import { useCallback, useEffect, useRef } from 'react';
import type { useProfileData } from './useProfileData';
import type { useProfileSubscriptionCard } from './useProfileSubscriptionCard';
import type { useProfileSubscriptionMonitor } from './useProfileSubscriptionMonitor';
import type { useProfileSubscriptionState } from './useProfileSubscriptionState';
import type { useProfileSubscriptionStorage } from './useProfileSubscriptionStorage';

type Props = Pick<ReturnType<typeof useProfileSubscriptionState>,
  | 'isSubscriptionPaymentAutoChecking'
  | 'selectedSubscriptionPaymentChannel'
  | 'setSelectedSubscriptionPaymentChannel'
  | 'setSubscriptionModalStep'
  | 'setSubscriptionModalVisible'
  | 'setSubscriptionPaymentAutoCheckAttempt'
  | 'setSubscriptionPaymentMessage'
  | 'setSubscriptionPaymentOrderNumber'
  | 'setSubscriptionPaymentStage'
  | 'subscriptionDeferredSyncTimerRef'
  | 'subscriptionPaymentMountedRef'
  | 'subscriptionPaymentOrderNumber'
> & Pick<ReturnType<typeof useProfileData>,
  | 'currentUser'
  | 'isDriver'
  | 'refetchPaymentHistory'
  | 'refetchPremiumOverview'
  | 'refetchProfile'
> & Pick<ReturnType<typeof useProfileSubscriptionMonitor>,
  | 'checkSubscriptionPaymentByOrderNumber'
  | 'startSubscriptionPaymentAutoCheck'
  | 'stopSubscriptionPaymentAutoCheck'
> & Pick<ReturnType<typeof useProfileSubscriptionStorage>,
  | 'clearStoredSubscriptionPayment'
  | 'persistStoredSubscriptionPayment'
  | 'readStoredSubscriptionPayment'
> & Pick<ReturnType<typeof useProfileSubscriptionCard>,
  | 'openCardPaymentUrl'
>;

export function useProfileSubscriptionRecovery({
  checkSubscriptionPaymentByOrderNumber,
  clearStoredSubscriptionPayment,
  currentUser,
  isDriver,
  isSubscriptionPaymentAutoChecking,
  openCardPaymentUrl,
  persistStoredSubscriptionPayment,
  readStoredSubscriptionPayment,
  refetchPaymentHistory,
  refetchPremiumOverview,
  refetchProfile,
  selectedSubscriptionPaymentChannel,
  setSelectedSubscriptionPaymentChannel,
  setSubscriptionModalStep,
  setSubscriptionModalVisible,
  setSubscriptionPaymentAutoCheckAttempt,
  setSubscriptionPaymentMessage,
  setSubscriptionPaymentOrderNumber,
  setSubscriptionPaymentStage,
  startSubscriptionPaymentAutoCheck,
  stopSubscriptionPaymentAutoCheck,
  subscriptionDeferredSyncTimerRef,
  subscriptionPaymentMountedRef,
  subscriptionPaymentOrderNumber,
}: Props) {
  const { showDialog } = useDialog();

  // Keep refresh callbacks stable while restoring an order, so the restoration effect
  // is not cancelled by its own state update. Read the current order when needed.
  const currentOrderRef = useRef(subscriptionPaymentOrderNumber);
  useEffect(() => { currentOrderRef.current = subscriptionPaymentOrderNumber; }, [subscriptionPaymentOrderNumber]);

  const applyStoredSubscriptionPayment = useCallback((storedPayment: StoredSubscriptionPayment) => {
    setSelectedSubscriptionPaymentChannel(storedPayment.channel);
    setSubscriptionPaymentOrderNumber(storedPayment.orderNumber);
    setSubscriptionPaymentStage(storedPayment.paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation');
    setSubscriptionPaymentMessage(
      getSubscriptionPaymentStatusMessage(
        storedPayment.message,
        'Abonnement non actif. Une tentative existe déjà ; nous gardons cette référence avant toute nouvelle tentative.',
      ),
    );
    setSubscriptionModalStep('payment');
  }, [setSelectedSubscriptionPaymentChannel, setSubscriptionModalStep, setSubscriptionPaymentMessage, setSubscriptionPaymentOrderNumber, setSubscriptionPaymentStage]);

  const refreshSubscriptionFromBackend = useCallback(
    async (options?: { closeModalOnActive?: boolean; pendingMessage?: string | null; showSuccessDialog?: boolean }) => {
      if (!isDriver) {
        return false;
      }

      const [overviewResult] = await Promise.allSettled([
        refetchPremiumOverview().unwrap(),
        Promise.resolve(refetchProfile()),
        Promise.resolve(refetchPaymentHistory()),
      ]);

      const overview = overviewResult.status === 'fulfilled' ? overviewResult.value : null;
      if (overview?.isPremium || overview?.isActive) {
        stopSubscriptionPaymentAutoCheck();
        await clearStoredSubscriptionPayment();
        setSubscriptionPaymentOrderNumber(null);
        setSubscriptionPaymentMessage(null);
        setSubscriptionPaymentStage('idle');
        setSubscriptionPaymentAutoCheckAttempt(0);
        setSubscriptionModalStep('method');
        if (options?.closeModalOnActive) {
          setSubscriptionModalVisible(false);
        }
        if (options?.showSuccessDialog) {
          showDialog({
            variant: 'success',
            title: 'Abonnement actif',
            message: 'Votre abonnement conducteur est actif. Vous pouvez publier plus de 5 trajets par jour.',
          });
        }
        return true;
      }

      if (options?.pendingMessage) {
        setSubscriptionPaymentStage(currentOrderRef.current ? 'operator_confirmation' : 'idle');
        setSubscriptionPaymentMessage(options.pendingMessage);
      }
      return false;
    },
    [isDriver, refetchPremiumOverview, refetchProfile, refetchPaymentHistory, stopSubscriptionPaymentAutoCheck, clearStoredSubscriptionPayment, setSubscriptionPaymentOrderNumber, setSubscriptionPaymentMessage, setSubscriptionPaymentStage, setSubscriptionPaymentAutoCheckAttempt, setSubscriptionModalStep, setSubscriptionModalVisible, showDialog],
  );

  const restoreRecentPendingSubscriptionPayment = useCallback(
    async (message?: string | null) => {
      if (!currentUser?.id) {
        return null;
      }

      try {
        const latestPaymentHistory = await refetchPaymentHistory().unwrap();
        const latestPendingPayment = getMostRecentPendingSubscriptionPayment(latestPaymentHistory);
        const storedPayment = latestPendingPayment
          ? buildStoredSubscriptionPaymentFromHistory(
            latestPendingPayment,
            currentUser.id,
            selectedSubscriptionPaymentChannel,
          )
          : null;

        if (!storedPayment) {
          return null;
        }

        applyStoredSubscriptionPayment(storedPayment);
        if (message) {
          setSubscriptionPaymentMessage(
            getSubscriptionPaymentStatusMessage(
              message,
              'Référence de paiement retrouvée côté Zwanga. Le suivi automatique reprend.',
            ),
          );
        }
        await persistStoredSubscriptionPayment({
          channel: storedPayment.channel,
          message: getSubscriptionPaymentStatusMessage(
            message || storedPayment.message,
            'Référence de paiement retrouvée côté Zwanga. Le suivi automatique reprend.',
          ),
          orderNumber: storedPayment.orderNumber,
          paymentMethod: storedPayment.paymentMethod,
          paymentUrl: storedPayment.paymentUrl,
        });

        return storedPayment;
      } catch {
        return null;
      }
    },
    [applyStoredSubscriptionPayment, currentUser?.id, persistStoredSubscriptionPayment, refetchPaymentHistory, selectedSubscriptionPaymentChannel, setSubscriptionPaymentMessage],
  );

  const scheduleDeferredSubscriptionSync = useCallback(
    (message?: string | null) => {
      if (subscriptionDeferredSyncTimerRef.current) {
        clearTimeout(subscriptionDeferredSyncTimerRef.current);
      }

      subscriptionDeferredSyncTimerRef.current = setTimeout(() => {
        subscriptionDeferredSyncTimerRef.current = null;
        if (!subscriptionPaymentMountedRef.current) {
          return;
        }

        void (async () => {
          const restoredPayment = await restoreRecentPendingSubscriptionPayment(message);
          if (restoredPayment?.orderNumber) {
            setSubscriptionModalStep('payment');
            setSubscriptionPaymentMessage(
              getSubscriptionPaymentStatusMessage(
                message,
                'Référence de paiement retrouvée côté Zwanga. Évitez de relancer le paiement ; le suivi automatique reprend.',
              ),
            );
            startSubscriptionPaymentAutoCheck(
              restoredPayment.orderNumber,
              getSubscriptionPaymentStatusMessage(
                message,
                'Référence de paiement retrouvée côté Zwanga. Nous reprenons le suivi automatique.',
              ),
            );
            return;
          }

          await refreshSubscriptionFromBackend({
            pendingMessage: message || 'Paiement encore en traitement côté Zwanga. Évitez de relancer immédiatement.',
          });
        })();
      }, SUBSCRIPTION_DEFERRED_BACKEND_SYNC_DELAY_MS);
    },
    [refreshSubscriptionFromBackend, restoreRecentPendingSubscriptionPayment, setSubscriptionModalStep, setSubscriptionPaymentMessage, startSubscriptionPaymentAutoCheck, subscriptionDeferredSyncTimerRef, subscriptionPaymentMountedRef],
  );

  const closeIfPremiumAlreadyActive = useCallback(async () => {
    if (!isDriver) {
      return false;
    }

    try {
      return await refreshSubscriptionFromBackend({
        closeModalOnActive: true,
        showSuccessDialog: true,
      });
    } catch {
      return false;
    }
  }, [isDriver, refreshSubscriptionFromBackend]);

  const resumeExistingSubscriptionPayment = useCallback(
    async (
      storedPayment?: StoredSubscriptionPayment | null,
      options?: {
        openCardPayment?: boolean;
        pendingMessage?: string;
      },
    ) => {
      const paymentToResume = storedPayment ?? (await readStoredSubscriptionPayment());
      const orderNumber = paymentToResume?.orderNumber ?? subscriptionPaymentOrderNumber;
      if (!orderNumber) {
        return null;
      }

      const pendingMessage =
        options?.pendingMessage ||
        'Un paiement existe déjà. Nous vérifions cette référence avant toute nouvelle tentative pour éviter un double débit.';

      if (paymentToResume) {
        applyStoredSubscriptionPayment(paymentToResume);
      }
      setSubscriptionModalVisible(true);
      setSubscriptionModalStep('payment');
      setSubscriptionPaymentOrderNumber(orderNumber);
      setSubscriptionPaymentStage(
        paymentToResume?.paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation',
      );
      setSubscriptionPaymentMessage(pendingMessage);

      const outcome = await checkSubscriptionPaymentByOrderNumber(orderNumber, {
        checkingStage: paymentToResume?.paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation',
        pendingStage: paymentToResume?.paymentMethod === 'card' ? 'zwanga_activation' : 'operator_confirmation',
        pendingMessage,
        suppressErrorDialog: true,
        silentErrorMessage:
          'Paiement déjà lancé. La vérification prend plus de temps que prévu ; la référence reste gardée.',
      });

      if (outcome === 'success' || outcome === 'failed') {
        return outcome;
      }

      if (options?.openCardPayment && paymentToResume?.paymentMethod === 'card' && paymentToResume.paymentUrl) {
        const cardRedirectUrls = createCardPaymentRedirectUrls();
        await openCardPaymentUrl(paymentToResume.paymentUrl, orderNumber, cardRedirectUrls.returnUrl);
        return outcome;
      }

      if (!isSubscriptionPaymentAutoChecking) {
        startSubscriptionPaymentAutoCheck(orderNumber, pendingMessage);
      }

      return outcome;
    },
    [applyStoredSubscriptionPayment, checkSubscriptionPaymentByOrderNumber, isSubscriptionPaymentAutoChecking, openCardPaymentUrl, readStoredSubscriptionPayment, setSubscriptionModalStep, setSubscriptionModalVisible, setSubscriptionPaymentMessage, setSubscriptionPaymentOrderNumber, setSubscriptionPaymentStage, startSubscriptionPaymentAutoCheck, subscriptionPaymentOrderNumber],
  );
  return {
    applyStoredSubscriptionPayment,
    closeIfPremiumAlreadyActive,
    refreshSubscriptionFromBackend,
    restoreRecentPendingSubscriptionPayment,
    resumeExistingSubscriptionPayment,
    scheduleDeferredSubscriptionSync,
  };
}
