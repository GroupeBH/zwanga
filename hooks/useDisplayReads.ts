import { useCallback, useEffect, useRef } from 'react';
import { useAppSelector } from '@/store/hooks';
import { getTokenSessionVersion } from '@/services/tokenSession';

/** Display subscriptions only: never use this to cancel an already sent mutation. */
export function useDisplayReadsEnabled(active: boolean) {
  const online = useAppSelector(state => state.zwangaApi.config.online);
  return active && online;
}

export function displayReadOptions(enabled: boolean, pollingInterval = 0) {
  return {
    skip: !enabled,
    pollingInterval: enabled ? pollingInterval : 0,
    skipPollingIfUnfocused: true,
    // Resubscription handles screen/network recovery once; global focus must not duplicate it.
    refetchOnMountOrArgChange: true,
    refetchOnFocus: false,
    refetchOnReconnect: false,
  } as const;
}

export type DisplayReadResult<T> = { data?: T; error?: unknown };
export type DisplayRefetch<T> = () => Promise<DisplayReadResult<T>>;

/** A late callback cannot restart a skipped query or return another account's data. */
export function useDisplayRefetch<T>(enabled: boolean, scope: string,
  refetch: () => PromiseLike<DisplayReadResult<T>>): DisplayRefetch<T> {
  const version = getTokenSessionVersion();
  const current = useRef({ enabled, scope, version, mounted: true, refetch });
  current.current = { enabled, scope, version, mounted: current.current.mounted, refetch };
  useEffect(() => {
    current.current.mounted = true;
    return () => { current.current.mounted = false; };
  }, []);
  return useCallback(async () => {
    const valid = () => current.current.mounted && current.current.enabled &&
      current.current.scope === scope && current.current.version === version && getTokenSessionVersion() === version;
    const suspended = () => ({ error: { status: 'CUSTOM_ERROR', error: 'Lecture suspendue. Revenez à cet écran avec une connexion.' } });
    if (!valid()) return suspended();
    try {
      const result = await current.current.refetch();
      return valid() ? result : suspended();
    } catch (error) { return { error }; }
  }, [scope, version]);
}

/** Keep currentData visible offline, never the previous query argument/account. */
export function useDisplayReadData<T>(scope: string, data: T | undefined): T | undefined {
  const version = getTokenSessionVersion();
  const cached = useRef({ scope, version, data });
  if (cached.current.scope !== scope || cached.current.version !== version) cached.current = { scope, version, data };
  else if (data !== undefined) cached.current.data = data;
  return cached.current.data;
}
