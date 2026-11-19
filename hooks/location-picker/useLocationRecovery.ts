import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { usePermissionReturn } from '@/hooks/usePermissionReturn';
import { checkForegroundLocationAccess, openLocationAccessSettings, type LocationAccessIssue } from '@/services/foregroundLocationAccess';
import { notifyLocationAccessChanged } from '@/services/locationAccessSignal';

/** Recovery is opt-in; a manual map choice cancels any pending GPS restoration. */
export function useLocationRecovery(onReady: () => void, active = true, observe = false) {
  const [issue, setIssue] = useState<LocationAccessIssue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resume, refresh] = useState(0);
  const latest = useRef({ active, onReady }); latest.current = { active, onReady };
  const pending = useRef(false), mounted = useRef(true), checkAfterAction = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const lastAccess = useRef<LocationAccessIssue | null>(null);
  const clear = useCallback(() => {
    pending.current = false; checkAfterAction.current = false;
    operation.current?.abort(); operation.current = null;
    setBusy(false); setIssue(null); setError('');
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current = false; operation.current?.abort(); };
  }, []);
  usePermissionReturn(() => { if (pending.current || observe) refresh(value => value + 1); });

  const run = useCallback(async (mode: 'check' | 'observe' | 'request' | 'settings') => {
    if (!mounted.current || !latest.current.active || AppState.currentState !== 'active') return;
    if (operation.current) { if (mode === 'check') checkAfterAction.current = true; return; }
    const controller = new AbortController(); operation.current = controller;
    const valid = () => mounted.current && operation.current === controller && !controller.signal.aborted;
    if (mode !== 'observe') { setBusy(true); setError(''); }
    try {
      const next = await checkForegroundLocationAccess(controller.signal, valid, mode === 'request' || mode === 'settings');
      if (!valid()) return;
      setIssue(next);
      setError('');
      const recovered = lastAccess.current !== null && next === null;
      lastAccess.current = next;
      // Observation never requests consent, recentres the map or restores an old GPS choice.
      if (mode === 'observe') {
        if (recovered && latest.current.active && AppState.currentState === 'active') notifyLocationAccessChanged();
        return;
      }
      if (!next) {
        // The native prompt can resolve before React receives the active state.
        // Keep the explicit action pending rather than losing its GPS retry.
        pending.current = !latest.current.active || AppState.currentState !== 'active';
        if (!pending.current) { notifyLocationAccessChanged(); latest.current.onReady(); }
      } else if (mode === 'settings' && next !== 'permission') {
        pending.current = true;
        if (!await openLocationAccessSettings(next, controller.signal, () => valid() && latest.current.active)) pending.current = false;
      } else pending.current = false;
    } catch {
      if (valid()) { pending.current = false; setError('Impossible de vérifier la localisation. Réessayez.'); }
    } finally {
      if (valid()) {
        operation.current = null; controller.abort(); setBusy(false);
        if (checkAfterAction.current) { checkAfterAction.current = false; refresh(value => value + 1); }
      }
    }
  }, []);
  useEffect(() => { if (active && pending.current) void run('check'); }, [active, resume, run]);
  useEffect(() => {
    if (!active || !observe) return;
    const check = () => { if (!pending.current) void run('observe'); };
    check();
    // Covers GPS toggled in Android quick settings; never reads while backgrounded.
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [active, observe, resume, run]);
  return { issue, setIssue, busy, error, clear, request: () => run('request'), recover: () => run('settings') };
}
