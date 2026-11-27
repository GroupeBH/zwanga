import { useEffect, useRef, useState } from 'react';
import { useConfirmCashReceiptMutation } from '@/store/api/bookingApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getApiErrorMessage } from '@/utils/errorHelpers';

/** One explicit tap, server-authoritative receipt; no optimistic collection. */
export function useCashReceiptConfirmation(bookingId: string, amount: number | null, currency: string, active: boolean, cashExceptionOccurrence?: number, onFailure?: () => void, canSubmit = active) {
  const [confirm] = useConfirmCashReceiptMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [received, setReceived] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const session = getTokenSessionVersion();
  const scope = `${session}:${bookingId}:${amount}:${currency}`;
  const latest = useRef({ scope, active, cashExceptionOccurrence, canSubmit });
  latest.current = { scope, active, cashExceptionOccurrence, canSubmit };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setReceived(false); setError(''); }, [scope]);
  const submit = async () => {
    const current = () => mounted.current && latest.current.active && latest.current.scope === scope && getTokenSessionVersion() === session;
    // Revalidating display conditions must stop NEW submissions, never discard
    // a valid response to an already dispatched, acknowledged receipt.
    if (inFlight.current || !current() || !latest.current.canSubmit || latest.current.cashExceptionOccurrence !== cashExceptionOccurrence || amount === null || !Number.isFinite(amount) || amount <= 0 || !['CDF', 'USD'].includes(currency)) return false;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const result = await confirm({ bookingId, amount, currency, ...(cashExceptionOccurrence ? { cashExceptionOccurrence } : {}) }).unwrap();
      if (!current()) return false;
      if (result.id !== bookingId || !result.cashReceivedAt || Number(result.cashReceivedAmount) !== amount || result.paymentCurrency !== currency) {
        setError('La confirmation n’a pas été enregistrée. Actualisez le trajet puis réessayez.');
        onFailure?.();
        return false;
      }
      setReceived(true);
      return true;
    } catch (failure) {
      if (current()) {
        setError(getApiErrorMessage(failure, 'Impossible de confirmer le cash reçu. Vérifiez votre connexion et réessayez.'));
        onFailure?.();
      }
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { submit, busy, error, received };
}
