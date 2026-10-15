import { useEffect, useRef, useState } from 'react';
import { getAuthErrorMessage } from '@/features/auth/authModel';
import { trackEvent } from '@/services/analytics';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { recordStartupMilestone } from '@/services/startupDiagnostics';
import { saveTokensAndUpdateState } from '@/store/slices/authSlice';
import type { useLoginMutation } from '@/store/api/zwangaApi';
import type { useAppDispatch } from '@/store/hooks';

export function usePinLogin({ active, phone, login, dispatch, setPin, onRetry }: {
  active: boolean;
  phone: string;
  login: ReturnType<typeof useLoginMutation>[0];
  dispatch: ReturnType<typeof useAppDispatch>;
  setPin: (value: string) => void;
  onRetry: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const completed = useRef(false);
  const mounted = useRef(true);
  const view = useRef({ active, phone });
  view.current = { active, phone };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { completed.current = false; setErrorMessage(null); }, [active, phone]);

  const submit = async (value: string) => {
    let session = getTokenSessionVersion();
    const canContinue = () => mounted.current && view.current.active && view.current.phone === phone &&
      session === getTokenSessionVersion();
    if (!active || !canContinue() || inFlight.current || completed.current || !/^\d{4}$/.test(value)) return;
    // This ref also protects auto-submit + a button press before React rerenders.
    inFlight.current = true;
    setIsPending(true);
    setErrorMessage(null);
    recordStartupMilestone('login_started');
    let received = false;
    try {
      const result = await login({ phone, pin: value }).unwrap();
      if (!canContinue()) return;
      received = true;
      recordStartupMilestone('login_received');
      const saving = dispatch(saveTokensAndUpdateState(result));
      // Our own new login advances the generation synchronously before native writes.
      // Follow that generation, but still ignore a later logout/account change.
      session = getTokenSessionVersion();
      const saved = await saving.unwrap();
      if (!canContinue()) return;
      if (!saved) throw new Error('La connexion n’a pas pu être confirmée. Réessayez.');
      completed.current = true;
      void trackEvent('login_success', { method: 'phone' }).catch(() => undefined);
    } catch (error) {
      if (!canContinue()) return;
      recordStartupMilestone('login_failed');
      recordStartupMilestone(received ? 'login_session_failed' : 'login_request_failed');
      setPin('');
      // Keep failure feedback in this form: no native dialog/keyboard transition.
      // A storage failure is not an incorrect PIN and must not be presented as one.
      setErrorMessage(received
        ? 'Impossible de finaliser la connexion sur ce téléphone. Réessayez.'
        : getAuthErrorMessage(error, 'Connexion impossible. Vérifiez votre numéro et votre PIN, puis réessayez.'));
      onRetry();
    } finally {
      // A successful request is still busy until the auth screen is replaced.
      if (!completed.current) {
        inFlight.current = false;
        if (mounted.current) setIsPending(false);
      }
    }
  };

  return { submit, isPending, errorMessage, isInFlight: () => inFlight.current };
}
