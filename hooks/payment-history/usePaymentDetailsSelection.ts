import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccountScreenScope } from '@/hooks/useAccountScreenScope';
import type { useLazyGetPaymentDetailsQuery } from '@/store/api/paymentApi';
import type { useDialog } from '@/components/ui/DialogProvider';
import type { PaymentHistoryItem } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';

export function usePaymentDetailsSelection(
  getDetails: ReturnType<typeof useLazyGetPaymentDetailsQuery>[0],
  showDialog: ReturnType<typeof useDialog>['showDialog'],
) {
  const captureScope = useAccountScreenScope();
  const sequence = useRef(0);
  const selection = useRef<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentHistoryItem | null>(null);
  const [loadingDetailsPaymentId, setLoadingDetailsPaymentId] = useState<string | null>(null);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const closeDetails = useCallback((onlyPaymentId?: string) => {
    if (onlyPaymentId && selection.current !== onlyPaymentId) return;
    sequence.current++;
    selection.current = null;
    setSelectedPayment(null);
    setLoadingDetailsPaymentId(null);
  }, []);
  useEffect(() => {
    closeDetails();
    return invalidate;
  }, [captureScope, closeDetails, invalidate]);

  const openDetails = useCallback(async (id: string) => {
    const isCurrentScope = captureScope();
    if (!isCurrentScope()) return false;
    const request = ++sequence.current;
    const isCurrent = () => request === sequence.current && isCurrentScope();
    selection.current = id;
    setSelectedPayment(null);
    setLoadingDetailsPaymentId(id);
    try {
      const details = await getDetails(id).unwrap();
      if (!isCurrent()) return false;
      if (details.id !== id) throw new Error('Le détail reçu ne correspond pas au paiement choisi.');
      setSelectedPayment(details);
      return true;
    } catch (error) {
      if (isCurrent()) showDialog({
        variant: 'danger', title: 'Détail indisponible',
        message: getApiErrorMessage(error, 'Impossible de charger le détail du paiement pour le moment.'),
      });
      return false;
    } finally {
      if (isCurrent()) setLoadingDetailsPaymentId(null);
    }
  }, [captureScope, getDetails, showDialog]);
  return { selectedPayment, loadingDetailsPaymentId, openDetails, closeDetails };
}
