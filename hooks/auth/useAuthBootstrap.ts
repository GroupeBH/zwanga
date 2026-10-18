import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export const AUTH_BOOTSTRAP_TIMEOUT_MS = 8_000;

/** The navigator mounts only after credential restoration has actually completed. */
export function useAuthBootstrap(initialize: () => Promise<unknown>) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const pending = useRef(true);
  // A deadline only releases the UI; it cannot cancel a native keychain call.
  // Retrying must not start concurrent credential restorations.
  const inFlight = useRef<Promise<unknown> | null>(null);
  const retry = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    setStatus('loading');
    setAttempt(value => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    let settled = false;
    pending.current = true;
    const finish = (next: 'ready' | 'error') => {
      if (!active || settled) return;
      settled = true;
      pending.current = false;
      clearTimeout(timer);
      setStatus(next);
    };
    const timer = setTimeout(() => finish('error'), AUTH_BOOTSTRAP_TIMEOUT_MS);
    if (!inFlight.current) {
      let task: Promise<unknown>;
      try { task = Promise.resolve(initialize()); }
      catch (error) { task = Promise.reject(error); }
      inFlight.current = task;
      void task.then(() => { if (inFlight.current === task) inFlight.current = null; },
        () => { if (inFlight.current === task) inFlight.current = null; });
    }
    const task = inFlight.current;
    void (async () => {
      try {
        await task;
        finish('ready');
      } catch {
        finish('error');
      }
    })();
    return () => { active = false; clearTimeout(timer); };
  }, [attempt, initialize]);

  useEffect(() => {
    if (status !== 'error') return;
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') retry(); });
    return () => subscription.remove();
  }, [status, retry]);

  return { status, retry };
}
