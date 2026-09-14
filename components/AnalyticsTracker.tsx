import { initializeAnalytics, setAnalyticsUser, trackScreen, trackEvent } from '@/services/analytics';
import { getStartupElapsedMs, recordDiagnosticScreen } from '@/services/diagnostics';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { usePathname, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';

export function AnalyticsTracker() {
  const pathname = usePathname();
  const screenTemplate = useSegments().join('/');
  const user = useAppSelector(selectUser);
  const previousPathRef = useRef<string | null>(null);
  const hasReportedStartup = useRef(false);

  useEffect(() => {
    // Route templates contain [id], never passenger names, coordinates or booking identifiers.
    recordDiagnosticScreen(screenTemplate);
    if (hasReportedStartup.current || !screenTemplate || screenTemplate === 'splash') return;
    const task = InteractionManager.runAfterInteractions(() => {
      if (hasReportedStartup.current) return;
      hasReportedStartup.current = true;
      void trackEvent('app_first_screen_ready', { elapsed_ms: getStartupElapsedMs(), screen: screenTemplate });
    });
    return () => task.cancel();
  }, [screenTemplate]);

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
