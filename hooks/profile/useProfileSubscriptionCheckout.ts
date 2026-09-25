import { useDialog } from '@/components/ui/DialogProvider';
import {
  createCardPaymentRedirectUrls,
  DRC_MOBILE_MONEY_PREFIX,
  formatCongolesePaymentPhone,
  getApiMessage,
  getSubscriptionPaymentFailureMessage,
  getSubscriptionPaymentStatusMessage,
  isSubscriptionPaymentFailed,
  isValidCongolesePaymentPhone,
  openExternalUrl
} from '@/features/profile/profileModel';
import {
  useSubscribeToProMutation
} from '@/store/api/subscriptionApi';
import {
  isAmbiguousTransportError
} from '@/utils/errorHelpers';
import {
  Keyboard
} from 'react-native';
import type { useProfileData } from './useProfileData';
import type { useProfileSubscriptionCard } from './useProfileSubscriptionCard';
import type { useProfileSubscriptionMonitor } from './useProfileSubscriptionMonitor';
import type { useProfileSubscriptionRecovery } from './useProfileSubscriptionRecovery';
import type { useProfileSubscriptionState } from './useProfileSubscriptionState';
import type { useProfileSubscriptionStorage } from './useProfileSubscriptionStorage';

type Props = Pick<ReturnType<typeof useProfileSubscriptionMonitor>,
  | 'checkSubscriptionPaymentByOrderNumber'
  | 'finishSubscriptionPayment'
  | 'isCheckingSubscriptionPayment'
  | 'startSubscriptionPaymentAutoCheck'
  | 'stopSubscriptionPaymentAutoCheck'
> & Pick<ReturnType<typeof useProfileSubscriptionState>,
  | 'isRestoringSubscriptionPayment'
  | 'isSubscriptionCardPayment'
  | 'isSubscriptionPaymentAutoChecking'
  | 'selectedSubscriptionPaymentChannel'
  | 'setSubscriptionKeyboardHeight'
  | 'setSubscriptionModalStep'
  | 'setSubscriptionModalVisible'
  | 'setSubscriptionPaymentAutoCheckAttempt'
  | 'setSubscriptionPaymentMessage'
  | 'setSubscriptionPaymentOrderNumber'
  | 'setSubscriptionPaymentStage'
  | 'setSubscriptionPhone'
  | 'subscriptionPaymentOrderNumber'
  | 'subscriptionPhone'
> & Pick<ReturnType<typeof useProfileData>,
  | 'recentPendingSubscriptionOrderNumber'
> & Pick<ReturnType<typeof useProfileSubscriptionRecovery>,
  | 'closeIfPremiumAlreadyActive'
  | 'restoreRecentPendingSubscriptionPayment'
  | 'resumeExistingSubscriptionPayment'
  | 'scheduleDeferredSubscriptionSync'
> & Pick<ReturnType<typeof useProfileSubscriptionStorage>,
  | 'clearStoredSubscriptionPayment'
  | 'persistStoredSubscriptionPayment'
  | 'readStoredSubscriptionPayment'
> & Pick<ReturnType<typeof useProfileSubscriptionCard>,
  | 'openCardPaymentUrl'
>;

export function useProfileSubscriptionCheckout({
  checkSubscriptionPaymentByOrderNumber,
  clearStoredSubscriptionPayment,
  closeIfPremiumAlreadyActive,
  finishSubscriptionPayment,
  isCheckingSubscriptionPayment,
  isRestoringSubscriptionPayment,
  isSubscriptionCardPayment,
  isSubscriptionPaymentAutoChecking,
  openCardPaymentUrl,
  persistStoredSubscriptionPayment,
  readStoredSubscriptionPayment,
  recentPendingSubscriptionOrderNumber,
  restoreRecentPendingSubscriptionPayment,
  resumeExistingSubscriptionPayment,
  scheduleDeferredSubscriptionSync,
  selectedSubscriptionPaymentChannel,
  setSubscriptionKeyboardHeight,
  setSubscriptionModalStep,
  setSubscriptionModalVisible,
  setSubscriptionPaymentAutoCheckAttempt,
  setSubscriptionPaymentMessage,
  setSubscriptionPaymentOrderNumber,
  setSubscriptionPaymentStage,
  setSubscriptionPhone,
  startSubscriptionPaymentAutoCheck,
  stopSubscriptionPaymentAutoCheck,
  subscriptionPaymentOrderNumber,
  subscriptionPhone,
}: Props) {
  const { showDialog } = useDialog();

  const [subscribeToPro, { isLoading: isSubscribingPro }] = useSubscribeToProMutation();

  const closeSubscriptionModal = () => {
    if (isSubscribingPro || isCheckingSubscriptionPayment || isRestoringSubscriptionPayment) {
      return;
    }
    Keyboard.dismiss();
    setSubscriptionModalVisible(false);
    setSubscriptionModalStep('method');
    setSubscriptionKeyboardHeight(0);
    if (!subscriptionPaymentOrderNumber) {
      setSubscriptionPaymentStage('idle');
      setSubscriptionPaymentAutoCheckAttempt(0);
    }
  };

  const handleContinueSubscriptionPayment = () => {
    Keyboard.dismiss();

    if (!isSubscriptionCardPayment && !subscriptionPhone.trim()) {
      setSubscriptionPhone(DRC_MOBILE_MONEY_PREFIX);
    }
    setSubscriptionModalStep('payment');
  };

  const handleBackToSubscriptionMethod = () => {
    Keyboard.dismiss();
    if (!subscriptionPaymentOrderNumber) {
      setSubscriptionPaymentStage('idle');
      setSubscriptionPaymentAutoCheckAttempt(0);
    }
    setSubscriptionModalStep('method');
  };

  const handleSubmitSubscriptionPayment = async () => {
    if (subscriptionPaymentOrderNumber) {
      const hasRecentBackendPayment =
        recentPendingSubscriptionOrderNumber === subscriptionPaymentOrderNumber || isSubscriptionPaymentAutoChecking;

      if (hasRecentBackendPayment) {
        await resumeExistingSubscriptionPayment(null, {
          openCardPayment: isSubscriptionCardPayment,
          pendingMessage:
            'Paiement déjà lancé. Nous vérifions cette référence avant de rouvrir ou relancer le paiement.',
        });
        return;
      }

      await clearStoredSubscriptionPayment();
      setSubscriptionPaymentOrderNumber(null);
      setSubscriptionPaymentMessage(null);
    }

    const storedPayment = await readStoredSubscriptionPayment();
    if (storedPayment) {
      await resumeExistingSubscriptionPayment(storedPayment, {
        openCardPayment: storedPayment.paymentMethod === 'card',
        pendingMessage: 'Paiement déjà lancé. Nous vérifions cette référence avant de rouvrir ou relancer le paiement.',
      });
      return;
    }

    const phone = formatCongolesePaymentPhone(subscriptionPhone);
    const paymentMethod = isSubscriptionCardPayment ? 'card' : 'mobile_money';

    if (!isSubscriptionCardPayment && !phone) {
      showDialog({
        variant: 'warning',
        title: 'Numéro requis',
        message: 'Entrez le numéro Mobile Money qui recevra la demande de paiement.',
      });
      return;
    }

    if (!isSubscriptionCardPayment && !isValidCongolesePaymentPhone(phone)) {
      showDialog({
        variant: 'warning',
        title: 'Numéro invalide',
        message: 'Le numéro Mobile Money doit commencer par +243, par exemple +243891234567.',
      });
      return;
    }

    try {
      stopSubscriptionPaymentAutoCheck();
      setSubscriptionPaymentStage('preparing');
      setSubscriptionPaymentAutoCheckAttempt(0);
      setSubscriptionPaymentMessage(
        'Préparation du paiement. Patientez quelques secondes ; la référence sera gardée dès qu’elle sera disponible.',
      );
      if (!isSubscriptionCardPayment) {
        setSubscriptionPhone(phone);
      }

      if (await closeIfPremiumAlreadyActive()) {
        return;
      }

      const cardRedirectUrls = isSubscriptionCardPayment ? createCardPaymentRedirectUrls() : null;
      const response = await subscribeToPro({
        paymentMethod,
        phone: isSubscriptionCardPayment ? undefined : phone,
        ...(cardRedirectUrls
          ? {
            approveUrl: cardRedirectUrls.approveUrl,
            cancelUrl: cardRedirectUrls.cancelUrl,
            declineUrl: cardRedirectUrls.declineUrl,
          }
          : {}),
      }).unwrap();

      if (await finishSubscriptionPayment(response)) {
        return;
      }

      if (isSubscriptionPaymentFailed(response)) {
        await clearStoredSubscriptionPayment();
        setSubscriptionPaymentOrderNumber(null);
        setSubscriptionPaymentMessage(getSubscriptionPaymentFailureMessage(response.payment.message));
        setSubscriptionPaymentStage('failed');
        return;
      }

      setSubscriptionPaymentOrderNumber(response.payment.orderNumber);
      if (response.payment.orderNumber) {
        await persistStoredSubscriptionPayment({
          channel: selectedSubscriptionPaymentChannel,
          message: getSubscriptionPaymentStatusMessage(
            response.payment.message,
            'Paiement en attente chez le prestataire. Nous continuons le suivi.',
          ),
          orderNumber: response.payment.orderNumber,
          paymentMethod,
          paymentUrl: response.payment.paymentUrl,
        });
      }

      if (response.payment.paymentUrl) {
        setSubscriptionPaymentStage('card_redirect');
        setSubscriptionPaymentMessage(
          'Page de paiement par carte FlexPay ouverte. Finalisez le paiement ; au retour, l’app actualisera l’abonnement sans le relancer.',
        );
        if (cardRedirectUrls) {
          await openCardPaymentUrl(
            response.payment.paymentUrl,
            response.payment.orderNumber,
            cardRedirectUrls.returnUrl,
          );
        } else {
          await openExternalUrl(response.payment.paymentUrl);
        }
        return;
      }

      if (!isSubscriptionCardPayment && response.payment.orderNumber) {
        const pendingMessage = getSubscriptionPaymentStatusMessage(
          response.payment.message,
          'Demande envoyée sur votre téléphone. Confirmez avec votre PIN Mobile Money ; Zwanga activera l’abonnement dès confirmation du paiement.',
        );
        setSubscriptionPaymentStage('phone_confirmation');
        setSubscriptionPaymentMessage(pendingMessage);
        startSubscriptionPaymentAutoCheck(response.payment.orderNumber, pendingMessage);
        return;
      }

      setSubscriptionPaymentStage(response.payment.orderNumber ? 'operator_confirmation' : 'preparing');
      setSubscriptionPaymentMessage(
        getSubscriptionPaymentStatusMessage(
          response.payment.message,
          'Demande de paiement créée. Confirmez sur votre téléphone ; la référence reste disponible pour le suivi.',
        ),
      );
    } catch (error: any) {
      if (isAmbiguousTransportError(error)) {
        const pendingMessage =
          'Le lancement prend plus de temps que prévu. Ne relancez pas le paiement ; nous vérifions son statut dans quelques secondes.';
        setSubscriptionModalStep('payment');
        setSubscriptionPaymentStage('operator_confirmation');
        setSubscriptionPaymentMessage(pendingMessage);
        const restoredPayment = await restoreRecentPendingSubscriptionPayment(pendingMessage);
        if (restoredPayment?.orderNumber) {
          startSubscriptionPaymentAutoCheck(restoredPayment.orderNumber, pendingMessage);
          return;
        }

        scheduleDeferredSubscriptionSync(pendingMessage);
        showDialog({
          variant: 'info',
          title: 'Paiement en traitement',
          message:
            'La réponse met du temps à revenir. Évitez de payer une deuxième fois ; ouvrez cette fenêtre dans quelques instants, le suivi reprendra.',
        });
        return;
      }

      setSubscriptionPaymentStage('failed');
      showDialog({
        variant: 'danger',
        title: 'Paiement impossible',
        message: getApiMessage(error, 'Impossible de lancer le paiement pour le moment.'),
      });
    }
  };

  return {
    closeSubscriptionModal,
    handleBackToSubscriptionMethod,
    handleContinueSubscriptionPayment,
    handleSubmitSubscriptionPayment,
    isSubscribingPro,
  };
}
