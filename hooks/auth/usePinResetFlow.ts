import {
  useRequestPinResetOtpMutation,
  useResetPinMutation,
  useVerifyPinResetOtpMutation,
} from '@/store/api/authApi';
import { useEffect, useRef } from 'react';

export const PIN_RESET_OTP_LENGTH = 6;
export const emptyPinResetOtp = () => Array<string>(PIN_RESET_OTP_LENGTH).fill('');

/** Both screens use the same one-time proof; it is never persisted on disk. */
export function usePinResetFlow(phone: string, active: boolean) {
  const proof = useRef<{ token: string; expiresAt: number } | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const [send, sendState] = useRequestPinResetOtpMutation();
  const [verify, verifyState] = useVerifyPinResetOtpMutation();
  const [reset, resetState] = useResetPinMutation();

  useEffect(() => {
    if (!active) {
      proof.current = null;
      generation.current += 1;
    }
  }, [active]);

  useEffect(() => () => {
    proof.current = null;
    generation.current += 1;
  }, [phone]);

  const requestOtp = async () => {
    if (busy.current) return false;
    busy.current = true;
    proof.current = null;
    const current = generation.current;
    const request = send({ phone });
    try {
      await request.unwrap();
      return current === generation.current;
    } catch (error) {
      if (current !== generation.current) return false;
      throw error;
    } finally {
      request.reset();
      busy.current = false;
    }
  };

  const verifyOtp = async (otp: string) => {
    if (busy.current || !active) return false;
    busy.current = true;
    proof.current = null;
    const current = generation.current;
    const request = verify({ phone, otp });
    try {
      const result = await request.unwrap();
      if (current !== generation.current) return false;
      if (!result.resetToken || !(result.expiresInSeconds > 0)) {
        throw new Error('La vérification a échoué. Demandez un nouveau code.');
      }
      proof.current = {
        token: result.resetToken,
        expiresAt: Date.now() + Math.min(result.expiresInSeconds, 300) * 1000,
      };
      return true;
    } catch (error) {
      if (current !== generation.current) return false;
      throw error;
    } finally {
      // Remove the OTP result from RTK Query as soon as the proof is captured.
      request.reset();
      busy.current = false;
    }
  };

  const confirmPin = async (newPin: string) => {
    if (busy.current || !active) return false;
    const verified = proof.current;
    proof.current = null;
    if (!verified || Date.now() >= verified.expiresAt) {
      throw new Error('La vérification a expiré. Demandez un nouveau code SMS.');
    }
    busy.current = true;
    const current = generation.current;
    const request = reset({ resetToken: verified.token, newPin });
    try {
      await request.unwrap();
      return current === generation.current;
    } catch (error) {
      if (current !== generation.current) return false;
      // Do not retry a consumed proof after an ambiguous network response.
      throw error;
    } finally {
      request.reset();
      busy.current = false;
    }
  };

  return {
    requestOtp,
    verifyOtp,
    confirmPin,
    isBusy: sendState.isLoading || verifyState.isLoading || resetState.isLoading,
    isVerifying: verifyState.isLoading,
  };
}
