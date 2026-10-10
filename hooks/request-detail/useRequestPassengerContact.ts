import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useAppSelector } from '@/store/hooks';
import { useGetTripRequestPassengerContactMutation } from '@/store/api/tripRequestApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { isDriverAccount } from '@/utils/accountRole';
import { getRequestContactSelection } from '@/features/request-detail/requestContactPolicy';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { NavigationContact } from '@/features/navigation/navigationContacts';

/** Opens the existing contact sheet, never a conversation or external app automatically. */
export function useRequestPassengerContact(requestId: string, enabled: boolean, validUntil?: number) {
  const user = useAppSelector(state => state.auth.user);
  const active = useScreenIsActive();
  const online = useDisplayReadsEnabled(active);
  const allowed = enabled && online && isDriverAccount(user) && Boolean(user?.id && requestId);
  const version = getTokenSessionVersion();
  const scope = useMemo(() => ({ requestId, userId: user?.id, allowed, validUntil, version }), [requestId, user?.id, allowed, validUntil, version]);
  const latest = useRef(scope); latest.current = scope;
  const mounted = useRef(false), pending = useRef(false), sequence = useRef(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [selection, setSelection] = useState<{ scope: typeof scope; contacts: NavigationContact[]; expiresAt: number } | null>(null);
  const [readContact] = useGetTripRequestPassengerContactMutation();
  const cancel = useCallback(() => { sequence.current++; pending.current = false; }, []);
  const close = useCallback(() => { cancel(); setSelection(null); setBusy(false); }, [cancel]);
  useLayoutEffect(() => {
    mounted.current = true; pending.current = false; setBusy(false); setError(''); setSelection(null);
    return () => { mounted.current = false; cancel(); };
  }, [scope, cancel]);
  useEffect(() => {
    if (!selection || selection.scope !== scope) return;
    let timer: ReturnType<typeof setTimeout>;
    const expire = () => {
      const remaining = selection.expiresAt - Date.now();
      if (remaining > 0) { timer = setTimeout(expire, Math.min(remaining, 2_147_483_647)); return; }
      close(); setError('Cette commande n’est plus disponible pour un contact avant acceptation.');
    };
    expire();
    return () => clearTimeout(timer);
  }, [selection, scope, close]);

  const open = async () => {
    if (!allowed || !mounted.current || latest.current !== scope || pending.current) return;
    if (validUntil !== undefined && Date.now() >= validUntil) { setError('Cette proposition a expiré.'); return; }
    pending.current = true; setBusy(true); setError('');
    const run = ++sequence.current, version = getTokenSessionVersion();
    const current = () => mounted.current && latest.current === scope && sequence.current === run && version === getTokenSessionVersion();
    const startedAt = Date.now();
    let opened = false;
    try {
      // The dedicated GET checks verified driver access and current assignment.
      const read = readContact(requestId);
      const response = await read.unwrap().finally(() => read.reset());
      if (!current()) return;
      const selected = getRequestContactSelection(response, requestId, user?.id, startedAt, validUntil);
      if (!selected) {
        setError('Cette commande n’est plus disponible pour un contact avant acceptation.'); return;
      }
      setSelection({ scope, ...selected });
      opened = true;
    } catch (cause) {
      if (current()) setError(getApiErrorMessage(cause, 'Impossible de charger le contact. Vérifiez votre connexion et réessayez.'));
    } finally {
      if (current()) { if (!opened) pending.current = false; setBusy(false); }
    }
  };
  const contacts = selection?.scope === scope && allowed && selection.expiresAt > Date.now() ? selection.contacts : null;
  return { open, close, contacts, busy, error, disabled: !allowed || busy || Boolean(contacts), offline: active && !online };
}
