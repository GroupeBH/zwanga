import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { recordStartupMilestone } from '@/services/startupDiagnostics';

export const AUTH_BOOTSTRAP_FEEDBACK_MS = 8_000;

/** The navigator mounts only after credential restoration has actually completed. */
export function useAuthBootstrap(initialize: () => Promise<unknown>) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'slow'>('loading');
  const pending = useRef(true);
  const restored = useRef(false);
  const inFlight = useRef<Promise<unknown> | null>(null);
  const retry = useCallback(() => {
    if (pending.current || restored.current) return;
    pending.current = true;
    setStatus('loading');
    setAttempt(value => value + 1);
  }, []);

  useEffect(() => {
    // A pending retry render may arrive just after the original work succeeded.
    if (restored.current) { setStatus('ready'); return; }
    let active = true;
    pending.current = true;
    // SecureStore cannot be cancelled. Retrying a slow restoration observes the
    // same operation instead of racing another refresh/native read against it.
    if (!inFlight.current) {
      recordStartupMilestone('restore_started');
      const work = (async () => initialize())();
      inFlight.current = work;
      const release = () => { if (inFlight.current === work) inFlight.current = null; };
      void work.then(release, release);
    }
    const work = inFlight.current;
    const timeout = setTimeout(() => {
      if (!active) return;
      pending.current = false;
      setStatus('slow');
      recordStartupMilestone('restore_slow');
    }, AUTH_BOOTSTRAP_FEEDBACK_MS);
    void (async () => {
      try {
        await work;
        if (active) { restored.current = true; setStatus('ready'); recordStartupMilestone('restore_ready'); }
      } catch {
        if (active) { setStatus('error'); recordStartupMilestone('restore_failed'); }
      } finally {
        clearTimeout(timeout);
        if (active) pending.current = false;
      }
    })();
    return () => { active = false; clearTimeout(timeout); };
  }, [attempt, initialize]);

  useEffect(() => {
    if (status !== 'error') return;
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') retry(); });
    return () => subscription.remove();
  }, [status, retry]);

  return { status, retry };
}
