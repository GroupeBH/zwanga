import { initializeAnalytics, setAnalyticsUser, trackScreen } from '@/services/analytics';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';

export function AnalyticsTracker() {
  const pathname = usePathname();
  const user = useAppSelector(selectUser);
  const previousPathRef = useRef<string | null>(null);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void initializeAnalytics();
    });

    return () => task.cancel();
  }, []);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void setAnalyticsUser(
        user
          ? {
              id: user.id,
              role: user.role,
              status: user.status ?? null,
              verified: user.verified ?? null,
              identityVerified: user.identityVerified ?? null,
            }
          : null,
      );
    });

    return () => task.cancel();
  }, [user]);

  useEffect(() => {
    if (!pathname || previousPathRef.current === pathname) {
      return;
    }

    previousPathRef.current = pathname;
    const task = InteractionManager.runAfterInteractions(() => {
      void trackScreen(pathname);
    });

    return () => task.cancel();
  }, [pathname]);

  return null;
}
