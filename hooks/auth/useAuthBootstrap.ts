import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** The navigator mounts only after credential restoration has actually completed. */
export function useAuthBootstrap(initialize: () => Promise<unknown>) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const pending = useRef(true);
  const retry = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    setStatus('loading');
    setAttempt(value => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    pending.current = true;
    void (async () => {
      try {
        await initialize();
        if (active) setStatus('ready');
      } catch {
        if (active) setStatus('error');
      } finally {
        if (active) pending.current = false;
      }
    })();
    return () => { active = false; };
  }, [attempt, initialize]);

  useEffect(() => {
    if (status !== 'error') return;
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') retry(); });
    return () => subscription.remove();
  }, [status, retry]);

  return { status, retry };
}
