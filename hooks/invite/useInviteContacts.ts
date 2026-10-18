import * as Contacts from 'expo-contacts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createContactPager, type ContactPage } from '@/features/invite/contactPager';

export function useInviteContacts(active: boolean) {
  const [permission, setPermission] = useState<Contacts.PermissionStatus | null>(null);
  const [permissionError, setPermissionError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [offsets, setOffsets] = useState([0]);
  const offset = offsets[offsets.length - 1];
  const key = `${search}:${offset}`;
  const [result, setResult] = useState<{ key: string; page?: ContactPage; error?: boolean; loading: boolean }>({ key: '', loading: true });
  const permissionFlight = useRef<Promise<Contacts.PermissionResponse> | null>(null);
  const pager = useMemo(() => createContactPager(Contacts.getContactsAsync), []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setPermissionError(false);
    const request = permissionFlight.current ?? Contacts.getPermissionsAsync().then(status =>
      status.status === 'undetermined' && status.canAskAgain ? Contacts.requestPermissionsAsync() : status);
    permissionFlight.current = request;
    void request.then(status => { if (!cancelled) setPermission(status.status); })
      .catch(() => { if (!cancelled) setPermissionError(true); })
      .finally(() => { if (permissionFlight.current === request) permissionFlight.current = null; });
    return () => { cancelled = true; };
  }, [active, revision]);

  useEffect(() => {
    if (!active || permission !== 'granted') return;
    const controller = new AbortController();
    setResult({ key, loading: true });
    const timer = setTimeout(() => {
      void pager(search, offset, controller.signal).then(page => {
        if (!controller.signal.aborted) setResult({ key, page, loading: false });
      }).catch(() => {
        if (!controller.signal.aborted) setResult({ key, error: true, loading: false });
      });
    }, search.trim() ? 350 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active, permission, search, offset, key, pager, revision]);

  const page = result.key === key ? result.page : undefined;
  const loading = !permissionError && (permission === null ||
    (permission === 'granted' && (result.key !== key || result.loading)));
  const changeSearch = useCallback((value: string) => { setSearch(value); setOffsets([0]); }, []);
  return {
    permission, search, changeSearch, contacts: page?.items ?? [], loading,
    error: permissionError || (result.key === key && Boolean(result.error)),
    pageNumber: offsets.length, hasPrevious: offsets.length > 1, hasNext: page?.nextOffset != null,
    next: () => { if (active && !loading && page?.nextOffset != null) setOffsets(previous => [...previous, page.nextOffset!]); },
    previous: () => { if (active && !loading) setOffsets(previous => previous.length > 1 ? previous.slice(0, -1) : previous); },
    retry: () => setRevision(value => value + 1),
  };
}
