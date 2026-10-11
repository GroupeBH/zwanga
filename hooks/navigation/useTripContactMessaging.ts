import type { NavigationContact } from '@/features/navigation/navigationContacts';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { useCreateConversationMutation, useResolveDirectConversationMutation } from '@/store/api/messageApi';
import { useAppSelector } from '@/store/hooks';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

/** Only called by an explicit tap; no conversation queries on opening the sheet. */
export function useTripContactMessaging(contacts: NavigationContact[], onClose: () => void) {
  const active = useIsFocused();
  return useContactMessaging(contacts, onClose, active);
}

/** Also usable by a global prompt, which has no screen-level navigation context. */
export function useContactMessaging(contacts: NavigationContact[], onClose: () => void, active: boolean) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const router = useRouter();
  const [createConversation] = useCreateConversationMutation();
  const [resolveDirect] = useResolveDirectConversationMutation();
  const contactKey = contacts.map(person => `${person.id}:${person.bookingId ?? ''}`).join('|');
  const scope = useMemo(() => ({ userId, active, contactKey }), [userId, active, contactKey]);
  const latest = useRef(scope);
  latest.current = scope;
  const mounted = useRef(false);
  const [openingScope, setOpeningScope] = useState<typeof scope | null>(null);
  const sequence = useRef(0);
  const pending = useRef(false);
  const cancel = useCallback(() => { sequence.current++; pending.current = false; if (mounted.current) setOpeningScope(null); }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    cancel();
    return () => { mounted.current = false; cancel(); };
  }, [scope, cancel]);

  const openMessage = async (person: NavigationContact) => {
    if (!mounted.current || latest.current !== scope || !active || !userId || userId === person.id || pending.current ||
      !contacts.some(item => item.id === person.id && item.bookingId === person.bookingId)) return;
    pending.current = true;
    setOpeningScope(scope);
    const request = ++sequence.current;
    const version = getTokenSessionVersion();
    const current = () => mounted.current && latest.current === scope && request === sequence.current &&
      version === getTokenSessionVersion();
    let navigated = false;
    try {
      // The booking endpoint checks membership and reuses its existing conversation.
      const conversation = person.bookingId
        ? await createConversation({ participantIds: [person.id], bookingId: person.bookingId }).unwrap()
        : await resolveDirect(person.id).unwrap();
      if (!current()) return;
      if (!conversation.id) throw new Error('Missing conversation');
      onClose();
      router.push({ pathname: '/chat/[id]', params: { id: conversation.id, title: person.name } });
      navigated = true;
      return true;
    } catch {
      if (current()) throw new Error('Impossible d’ouvrir la messagerie. Vérifiez votre connexion et réessayez.');
    } finally {
      if (!navigated && request === sequence.current) {
        pending.current = false;
        if (mounted.current) setOpeningScope(null);
      }
    }
  };
  return { openMessage, cancel, isOpeningConversation: openingScope === scope, canMessage: Boolean(active && userId), userId };
}
