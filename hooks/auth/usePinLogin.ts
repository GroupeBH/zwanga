import { useEffect, useRef, useState } from 'react';
import { getAuthErrorMessage } from '@/features/auth/authModel';
import { trackEvent } from '@/services/analytics';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { saveTokensAndUpdateState } from '@/store/slices/authSlice';
import type { useLoginMutation } from '@/store/api/zwangaApi';
import type { useAppDispatch } from '@/store/hooks';
import type { useDialog } from '@/components/ui/DialogProvider';

export function usePinLogin({ active, phone, login, dispatch, setPin, showDialog, onRetry }: {
  active: boolean;
  phone: string;
  login: ReturnType<typeof useLoginMutation>[0];
  dispatch: ReturnType<typeof useAppDispatch>;
  setPin: (value: string) => void;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  onRetry: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const inFlight = useRef(false);
  const completed = useRef(false);
  const mounted = useRef(true);
  const view = useRef({ active, phone });
  view.current = { active, phone };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { completed.current = false; }, [active, phone]);

  const submit = async (value: string) => {
    const session = getTokenSessionVersion();
    const canContinue = () => mounted.current && view.current.active && view.current.phone === phone &&
      session === getTokenSessionVersion();
    if (!active || !canContinue() || inFlight.current || completed.current || !/^\d{4}$/.test(value)) return;
    // This ref also protects auto-submit + a button press before React rerenders.
    inFlight.current = true;
    setIsPending(true);
    try {
      const result = await login({ phone, pin: value }).unwrap();
      if (!canContinue()) return;
      const saved = await dispatch(saveTokensAndUpdateState({
        accessToken: result.accessToken, refreshToken: result.refreshToken,
      })).unwrap();
      if (!saved) throw new Error('La connexion n’a pas pu être confirmée. Réessayez.');
      completed.current = true;
      void trackEvent('login_success', { method: 'phone' }).catch(() => undefined);
    } catch (error) {
      if (!canContinue()) return;
      setPin('');
      showDialog({ variant: 'danger', title: 'Connexion impossible', message: getAuthErrorMessage(error, 'Connexion impossible. Vérifiez votre PIN et réessayez.') });
      onRetry();
    } finally {
      // A successful request is still busy until the auth screen is replaced.
      if (!completed.current) {
        inFlight.current = false;
        if (mounted.current) setIsPending(false);
      }
    }
  };

  return { submit, isPending, isInFlight: () => inFlight.current };
}
