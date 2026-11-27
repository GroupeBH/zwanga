import { useRef, useLayoutEffect, useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useContactMessaging } from '@/hooks/navigation/useTripContactMessaging';
import { getTokenSessionVersion } from '@/services/tokenSession';
import type { CoPassenger } from '@/store/api/trip/coPassengers';
import type { useTripCoPassengers } from './useTripCoPassengers';

const noop = () => {};
/** No conversation is created until an explicit tap. Booking IDs are never user IDs. */
export function useCoPassengerActions(roster: ReturnType<typeof useTripCoPassengers>, onLeave = noop) {
  const router = useRouter();
  const contacts = (roster.participants ?? []).filter(p => p.userId).map(p => ({
    id: p.userId!, name: p.firstName, phone: null, detail: 'Passager du trajet',
  }));
  const enabled = roster.eligible && roster.online && Boolean(roster.participants) && !roster.denied && !roster.failed && !roster.busy;
  const messaging = useContactMessaging(contacts, onLeave, enabled);
  const [error, setError] = useState('');
  const session = getTokenSessionVersion();
  const key = contacts.map(c => `${c.id}:${c.name}`).join('|');
  const scope = useMemo(() => ({ enabled, session, key }), [enabled, session, key]);
  const latest = useRef(scope); latest.current = scope;
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = (p: CoPassenger) => mounted.current && latest.current === scope && enabled &&
    scope.session === getTokenSessionVersion() && Boolean(p.userId && contacts.some(c => c.id === p.userId));
  return {
    busy: messaging.isOpeningConversation, error: enabled ? error : '',
    profile(p: CoPassenger) {
      if (!current(p) || messaging.isOpeningConversation) return;
      onLeave();
      router.push({ pathname: '/public-profile/[id]', params: { id: p.userId! } });
    },
    async message(p: CoPassenger) {
      if (!current(p)) return;
      setError('');
      try { await messaging.openMessage(contacts.find(c => c.id === p.userId)!); }
      catch { if (current(p)) setError('Messagerie indisponible. Réessayez.'); }
    },
  };
}
