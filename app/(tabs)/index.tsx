import { HomeDashboard } from '@/components/home/HomeDashboard';
import { HomeEntryPlaceholder } from '@/components/home/HomeEntryPlaceholder';
import { useHomeContext } from '@/hooks/home/useHomeContext';
import { useRef } from 'react';

export default function HomeScreen() {
  const context = useHomeContext();
  const mountedAccount = useRef<string | undefined>(undefined);
  if (context.isHomeRoleReady && (!context.entryPending || context.preparationAllowed)) mountedAccount.current = context.currentUser?.id;
  // Prepare the correct account's Home under the shared cover. Reads may run,
  // but alerts, voice and interactive work wait until the entry decision settles.
  if (context.entryPending && !context.isHomeRoleReady) return null;
  if (context.entryPending && !context.preparationAllowed && mountedAccount.current !== context.currentUser?.id) return null;
  // Never mount a passenger dashboard as a placeholder for an unresolved role.
  // Cached, known profiles bypass this gate even during a background refetch.
  if (!context.isHomeRoleReady) return <HomeEntryPlaceholder
    failed={context.homeRoleError} fetching={context.homeRoleFetching} onRetry={context.retryHomeRole} />;
  return <HomeDashboard key={context.currentUser?.id} context={context} />;
}
