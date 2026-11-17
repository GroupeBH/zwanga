import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { readOtpDeadline, subscribeOtpCountdown, otpRemainingSeconds, type OtpCountdownPurpose } from '@/features/auth/otpCountdown';

export function useOtpCountdown(purpose: OtpCountdownPurpose, phone = '') {
  const [, refresh] = useState(0);
  const deadline = readOtpDeadline(purpose, phone);
  useEffect(() => subscribeOtpCountdown(() => refresh(value => value + 1)), []);
  useEffect(() => {
    const update = () => refresh(value => value + 1);
    // Absolute deadline, never a decremented counter that pauses while the phone sleeps.
    let timer: ReturnType<typeof setInterval> | undefined;
    if (deadline !== null && deadline > Date.now()) timer = setInterval(() => {
      update();
      if (Date.now() >= deadline) clearInterval(timer!);
    }, 1000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    return () => { if (timer !== undefined) clearInterval(timer); subscription.remove(); };
  }, [deadline]);
  return otpRemainingSeconds(deadline);
}
