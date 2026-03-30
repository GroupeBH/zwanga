import { initializeAnalytics, setAnalyticsUser, trackScreen } from '@/services/analytics';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

export function AnalyticsTracker() {
  const pathname = usePathname();
  const user = useAppSelector(selectUser);
  const previousPathRef = useRef<string | null>(null);

  useEffect(() => {
    void initializeAnalytics();
  }, []);

  useEffect(() => {
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
  }, [user]);

  useEffect(() => {
    if (!pathname || previousPathRef.current === pathname) {
      return;
    }

    previousPathRef.current = pathname;
    void trackScreen(pathname);
  }, [pathname]);

  return null;
}
