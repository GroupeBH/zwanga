import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** Keep the form in place while identity verification opens above it. */
export function usePassengerIdentityVerification(onLeave?: () => void, onReturn?: () => void) {
  const router = useRouter();
  const isActive = useScreenIsActive();
  const callbacks = useRef({ onLeave, onReturn });
  callbacks.current = { onLeave, onReturn };
  const awaitingReturn = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isActive && timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (isActive && awaitingReturn.current && !timer.current) {
      awaitingReturn.current = false;
      callbacks.current.onReturn?.();
    }
  }, [isActive]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return useCallback((source: 'extra_seats' | 'book' | 'request' = 'extra_seats') => {
    if (!isActive || awaitingReturn.current) return;
    callbacks.current.onLeave?.();
    awaitingReturn.current = true;
    // Dismiss native form modals before pushing the verification screen on iOS.
    timer.current = setTimeout(() => {
      timer.current = null;
      try {
        router.push({ pathname: '/verification', params: { source } });
      } catch (error) {
        awaitingReturn.current = false;
        callbacks.current.onReturn?.();
        console.warn('Impossible d’ouvrir la vérification d’identité:', error);
      }
    }, onLeave ? (Platform.OS === 'ios' ? 350 : 100) : 0);
  }, [isActive, onLeave, router]);
}
