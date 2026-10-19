import { HomeDashboard } from '@/components/home/HomeDashboard';
import { HomeEntryPlaceholder } from '@/components/home/HomeEntryPlaceholder';
import { useHomeContext } from '@/hooks/home/useHomeContext';
import { useRef } from 'react';

export default function HomeScreen() {
  const context = useHomeContext();
  const revealedAccount = useRef<string | undefined>(undefined);
  if (!context.entryPending && context.isHomeRoleReady) revealedAccount.current = context.currentUser?.id;
  // Keep the profile subscription, but do not start a dashboard/map before the
  // shared entry decision. A previously shown Home stays mounted and idle.
  if (context.entryPending && (!context.currentUser?.id || revealedAccount.current !== context.currentUser.id)) return null;
  // Never mount a passenger dashboard as a placeholder for an unresolved role.
  // Cached, known profiles bypass this gate even during a background refetch.
  if (!context.isHomeRoleReady) return <HomeEntryPlaceholder
    failed={context.homeRoleError} fetching={context.homeRoleFetching} onRetry={context.retryHomeRole} />;
  return <HomeDashboard key={context.currentUser?.id} context={context} />;
}
