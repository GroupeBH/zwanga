import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Router } from 'expo-router';

/** Release the detail's native map before mounting the destination's map. */
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
  const navigate = useCallback((destination: Parameters<Router['replace']>[0]) => {
    if (!live.current || currentScope.current !== scope || timer.current) return;
    setLeaving(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!live.current) return;
      try { router.replace(destination); }
      catch { console.warn('Changement d’écran impossible. Réessayez.'); }
      finally { setLeaving(false); }
    }, Platform.OS === 'ios' ? 260 : 40);
  }, [router, scope]);
  const goHome = useCallback(() => navigate('/(tabs)'), [navigate]);
  return { goHome, navigate, leaving };
}
