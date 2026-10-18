import { DRC_PAYMENT_PHONE_REGEX, formatTripPaymentPhone } from '../../features/trip-detail/tripDetailModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { ELECTRONIC_PAYMENTS_ENABLED } from '@/constants/paymentFeatures';
import { useInitiateBookingPaymentMutation } from '@/store/api/bookingApi';
import type { Booking } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { openExternalUrlSafely } from '@/utils/safeExternalUrl';
import type { User } from '@/types';

interface Params {
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  user: User | null;
  initiateBookingPayment: ReturnType<typeof useInitiateBookingPaymentMutation>[0];
  refreshBookingLists: () => void;
  activeBooking: Booking | null;
  isInitiatingBookingPayment: boolean;
}

export function useTripBookingPayment({
  showDialog,
  user,
  initiateBookingPayment,
  refreshBookingLists,
  activeBooking,
  isInitiatingBookingPayment,
}: Params) {
  const startElectronicPaymentForBooking = async (booking: Booking) => {
    if (!ELECTRONIC_PAYMENTS_ENABLED) {
      return;
    }

    if (
      booking.status !== 'completed' &&
      !booking.droppedOff &&
      !booking.droppedOffConfirmedByPassenger
    ) {
      showDialog({
        variant: 'info',
        title: "Paiement à l'arrivée",
        message: "Le paiement sera disponible après votre arrivée à destination.",
      });
      return;
    }

    const phone = formatTripPaymentPhone(user?.phone);
    if (!phone || !DRC_PAYMENT_PHONE_REGEX.test(phone)) {
      showDialog({
        variant: 'warning',
        title: 'Numéro Mobile Money requis',
        message:
          'Ajoutez un numéro congolais valide dans votre profil avant de lancer le paiement Mobile Money.',
      });
      return;
    }

    try {
      const response = await initiateBookingPayment({
        bookingId: booking.id,
        method: 'mobile_money',
        phone,
      }).unwrap();

      if (response.payment.paymentUrl) {
        await openExternalUrlSafely(response.payment.paymentUrl, { logLabel: 'TripBookingPayment' });
      }

      showDialog({
        variant:
          response.payment.status === 'succeeded' ? 'success' : 'info',
        title:
          response.payment.status === 'succeeded'
            ? 'Paiement confirmé'
            : 'Paiement lance',
        message: getApiErrorMessage(
          { message: response.payment.message },
          'Confirmez la demande de paiement sur votre téléphone.',
        ),
      });
      refreshBookingLists();
      return response;
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Paiement impossible',
        message: getApiErrorMessage(error, 'Impossible de lancer le paiement pour le moment.'),
      });
    }
  };

  const handlePayActiveBooking = async () => {
    if (
      !activeBooking ||
      !ELECTRONIC_PAYMENTS_ENABLED ||
      activeBooking.paymentMode !== 'electronic' ||
      isInitiatingBookingPayment
    ) {
      return;
    }

    await startElectronicPaymentForBooking(activeBooking);
  };

  return {
    handlePayActiveBooking,
  };
}
