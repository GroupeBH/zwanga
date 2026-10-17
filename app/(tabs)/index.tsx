import { HomeDashboard } from '@/components/home/HomeDashboard';
import { HomeRoleLoader } from '@/components/home/HomeRoleLoader';
import { useHomeContext } from '@/hooks/home/useHomeContext';

export default function HomeScreen() {
  const context = useHomeContext();
  // Never mount a passenger dashboard as a placeholder for an unresolved role.
  // Cached, known profiles bypass this gate even during a background refetch.
  if (!context.isHomeRoleReady) return <HomeRoleLoader
    failed={context.homeRoleError} active={context.isScreenActive}
    retrying={context.homeRoleFetching} onRetry={context.retryHomeRole} />;
  return <HomeDashboard key={context.currentUser?.id} context={context} />;
}
