import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Router } from 'expo-router';

/** Release the request's native map before mounting Home's map. */
export function useRequestDetailExit(router: Router, active: boolean, scope: string) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(active);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  live.current = active;
  useEffect(() => {
    live.current = active;
    setLeaving(false);
    return () => {
      live.current = false;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [active, scope]);
  const goHome = useCallback(() => {
    if (!live.current || currentScope.current !== scope || timer.current) return;
    setLeaving(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!live.current) return;
      try { router.replace('/(tabs)'); }
      catch { console.warn('Retour à l’accueil impossible. Réessayez.'); }
      finally { setLeaving(false); }
    }, Platform.OS === 'ios' ? 260 : 40);
  }, [router, scope]);
  return { goHome, leaving };
}
