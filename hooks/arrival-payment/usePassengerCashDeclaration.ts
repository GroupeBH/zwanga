import { useCallback } from 'react';
import { useDeclareCashPaymentMutation } from '@/store/api/bookingApi';

/** Acknowledges the passenger's declaration, never the driver's collection. */
export function usePassengerCashDeclaration(isSessionCurrent: () => boolean) {
  const [send, { isLoading }] = useDeclareCashPaymentMutation();
  const declare = useCallback(async (bookingId: string, amount: number, currency: string) => {
    if (!isSessionCurrent()) throw new Error('Session expirée. Reconnectez-vous.');
    if (!Number.isFinite(amount) || amount <= 0 || !['CDF', 'USD'].includes(currency)) throw new Error('Montant cash à vérifier. Actualisez le trajet.');
    const result = await send({ bookingId, amount, currency }).unwrap();
    if (!isSessionCurrent()) throw new Error('Session expirée.');
    if (result.id !== bookingId || result.paymentMode !== 'cash' || result.paymentStatus !== 'not_required' ||
        Number(result.paymentAmount) !== amount || result.paymentCurrency !== currency) {
      throw new Error('Le paiement cash a changé. Actualisez le trajet avant de confirmer.');
    }
    return result;
  }, [isSessionCurrent, send]);
  return { declare, busy: isLoading };
}
