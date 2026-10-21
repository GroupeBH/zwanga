import { useEffect, useRef, useState } from 'react';
import { passwordLoginError } from '@/features/auth/passwordLoginError';
import { trackEvent } from '@/services/analytics';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { saveTokensAndUpdateState } from '@/store/slices/authSlice';
import type { useLoginMutation } from '@/store/api/zwangaApi';
import type { useAppDispatch } from '@/store/hooks';

export function usePinLogin({ active, phone, login, dispatch, setPin }: {
  active: boolean;
  phone: string;
  login: ReturnType<typeof useLoginMutation>[0];
  dispatch: ReturnType<typeof useAppDispatch>;
  setPin: (value: string) => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [failure, setFailure] = useState<{ phone: string; session: number; message: string } | null>(null);
  const inFlight = useRef(false);
  const completed = useRef(false);
  const mounted = useRef(true);
  const view = useRef({ active, phone });
  view.current = { active, phone };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { completed.current = false; setFailure(null); }, [active, phone]);

  const submit = async (value: string) => {
    let session = getTokenSessionVersion();
    const canContinue = () => mounted.current && view.current.active && view.current.phone === phone &&
      session === getTokenSessionVersion();
    if (!active || !canContinue() || inFlight.current || completed.current || !/^\d{4}$/.test(value)) return;
    // This ref also protects auto-submit + a button press before React rerenders.
    inFlight.current = true;
    setFailure(null);
    setIsPending(true);
    try {
      const result = await login({ phone, pin: value }).unwrap();
      if (!canContinue()) return;
      const saving = dispatch(saveTokensAndUpdateState({
        accessToken: result.accessToken, refreshToken: result.refreshToken,
      })).unwrap();
      // storeTokens starts this login's new generation synchronously. Capture it
      // before awaiting storage, so a real write failure stays visible while a
      // subsequent logout/account change still invalidates this attempt.
      session = getTokenSessionVersion();
      const saved = await saving;
      if (!canContinue()) return;
      if (!saved) throw new Error('La connexion n’a pas pu être confirmée. Réessayez.');
      completed.current = true;
      void trackEvent('login_success', { method: 'phone' }).catch(() => undefined);
    } catch (error) {
      if (!canContinue()) return;
      setPin('');
      setFailure({ phone, session, message: passwordLoginError(error) });
    } finally {
      // A successful request is still busy until the auth screen is replaced.
      if (!completed.current) {
        inFlight.current = false;
        if (mounted.current) setIsPending(false);
      }
    }
  };

  const error = active && failure?.phone === phone && failure.session === getTokenSessionVersion() ? failure.message : null;
  return { submit, isPending, isInFlight: () => inFlight.current, error, clearError: () => setFailure(null) };
}
