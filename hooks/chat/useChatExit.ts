import type { Router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Keyboard, Platform } from 'react-native';

/** Release the chat list and keyboard before popping the native screen. */
export function useChatExit(conversationId: string, active: boolean, router: Router) {
  const [leaving, setLeaving] = useState(false);
  const session = useMemo(() => ({ conversationId, active: false, mounted: true, leaving: false }), [conversationId]);
  session.active = active;
  const isCurrent = useCallback(() => session.active && session.mounted && !session.leaving, [session]);
  const goBack = useCallback(() => {
    if (!isCurrent()) return;
    session.leaving = true;
    setLeaving(true);
  }, [isCurrent, session]);
  useEffect(() => {
    session.mounted = true;
    setLeaving(false);
    return () => { session.mounted = false; };
  }, [session]);
  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { goBack(); return true; });
    return () => subscription.remove();
  }, [active, goBack]);
  useEffect(() => {
    if (!leaving || !active) return;
    let completed = false;
    let frame: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (completed) return;
      completed = true;
      // Effect runs after the list/keyboard avoidance are removed from the render tree.
      frame = setTimeout(() => {
        if (!session.mounted || !session.active) return;
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)/messages');
      }, 40);
    };
    const subscription = Keyboard.addListener('keyboardDidHide', finish);
    const timeout = setTimeout(finish, Platform.OS === 'ios' && Keyboard.isVisible() ? 300 : 0);
    Keyboard.dismiss();
    return () => { completed = true; subscription.remove(); clearTimeout(timeout); if (frame !== undefined) clearTimeout(frame); };
  }, [active, leaving, router, session]);
  return { leaving, goBack, isCurrent };
}
