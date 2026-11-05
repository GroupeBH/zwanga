import { useEffect, useRef, useState } from 'react';
import { useSendPhoneVerificationOtpMutation, useVerifyPhoneOtpMutation } from '@/store/api/userApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getAuthErrorMessage } from '@/features/auth/authModel';

const emptyCode = () => ['', '', '', '', ''];
type OtpRequest = { abort?: () => void; reset: () => void };

/** Mounted with a key scoped to the account and its server-confirmed phone. */
export function useAccountPhoneOtp(phone: string, refreshProfile: () => Promise<unknown>) {
  const [sendOtp] = useSendPhoneVerificationOtpMutation();
  const [verifyOtp] = useVerifyPhoneOtpMutation();
  const [code, setCode] = useState(emptyCode);
  const [sent, setSent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const mounted = useRef(false);
  const locked = useRef(false);
  const request = useRef<OtpRequest | null>(null);
  const version = useRef(getTokenSessionVersion());
  const current = () => mounted.current && version.current === getTokenSessionVersion();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort?.();
      request.current?.reset();
      request.current = null;
    };
  }, []);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => {
      const timestamp = Date.now(); setNow(timestamp);
      if (timestamp >= retryAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  const run = async (action: () => Promise<void>, fallback: string) => {
    if (!current() || locked.current) return;
    locked.current = true;
    setBusy(true); setError('');
    try { await action(); }
    catch (cause) { if (current()) setError(getAuthErrorMessage(cause, fallback)); }
    finally {
      request.current?.reset(); request.current = null;
      locked.current = false;
      if (current()) setBusy(false);
    }
  };
  const send = async () => {
    if (confirmed || Date.now() < retryAt) return;
    await run(async () => {
      // Throttle even ambiguous failures: never resend automatically after a timeout.
      setRetryAt(Date.now() + 30_000); setNow(Date.now());
      const pending = sendOtp({ phone, context: 'update' });
      request.current = pending;
      await pending.unwrap();
      if (current()) { setSent(true); setCode(emptyCode()); }
    }, 'Impossible d’envoyer le SMS. Vérifiez votre connexion, puis réessayez.');
  };
  const verify = async () => {
    if (!sent || confirmed || !/^\d{5}$/.test(code.join(''))) return;
    await run(async () => {
      const pending = verifyOtp({ phone, otp: code.join('') });
      request.current = pending;
      const result = await pending.unwrap();
      if (!current()) return;
      if (result.valid !== true) throw new Error('Code incorrect ou expiré.');
      pending.reset(); request.current = null;
      setCode(emptyCode()); setConfirmed(true);
      // The SMS result alone cannot unlock: reread the authenticated profile.
      await refreshProfile();
    }, 'La confirmation n’a pas abouti. Réessayez.');
  };
  const retryConfirmation = () => run(async () => { await refreshProfile(); },
    'Le code est validé, mais la confirmation du compte est indisponible. Réessayez sans demander un nouveau code.');

  return { code, setCode, sent, confirmed, busy, error, send, verify, retryConfirmation,
    cooldown: Math.max(0, Math.ceil((retryAt - now) / 1000)) };
}
