import { useRef } from 'react';
import { getTokenSessionVersion } from '@/services/tokenSession';

type Snapshot<T> = { data?: T; error?: unknown };
const OFFLINE = { status: 'FETCH_ERROR', error: 'Connexion indisponible.' };

/** Retain display facts while unsubscribed, not server authority for a mutation.
 * Preserve access errors on blur; discard all retained data on route/account change.
 * An offline cold start still lets useOfflineRideData load the account's disk snapshot.
 */
export function useNavigationReadData<T>(scope: string, read: { currentData?: T; error?: unknown }, online: boolean): Snapshot<T> {
  const session = getTokenSessionVersion();
  const saved = useRef<{ scope: string; session: number; snapshot: Snapshot<T> }>({ scope, session, snapshot: {} });
  if (saved.current.scope !== scope || saved.current.session !== session) saved.current = { scope, session, snapshot: {} };
  const status = (read.error as { status?: number | string } | undefined)?.status;
  if ([401, 403, 404].includes(Number(status))) saved.current.snapshot = { error: read.error };
  else if (read.currentData !== undefined || read.error) saved.current.snapshot = {
    data: read.currentData ?? saved.current.snapshot.data, error: read.error,
  };
  const { data, error } = saved.current.snapshot;
  return { data, error: error ?? (online ? undefined : OFFLINE) };
}
