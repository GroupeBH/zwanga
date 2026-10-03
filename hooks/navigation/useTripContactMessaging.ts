import { findDirectConversationWithUser } from '@/utils/directConversation';
import type { NavigationContact } from '@/features/navigation/navigationContacts';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { useCreateConversationMutation, useLazyListConversationsQuery } from '@/store/api/messageApi';
import { useAppSelector } from '@/store/hooks';
import { selectConversations } from '@/store/selectors';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';

/** Only called by an explicit tap; no conversation queries on opening the sheet. */
export function useTripContactMessaging(contacts: NavigationContact[], onClose: () => void) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const conversations = useAppSelector(selectConversations);
  const active = useIsFocused();
  const router = useRouter();
  const [createConversation] = useCreateConversationMutation();
  const [loadConversations] = useLazyListConversationsQuery();
  const contactKey = contacts.map(person => `${person.id}:${person.bookingId ?? ''}`).join('|');
  const scope = useMemo(() => ({ userId, active, contactKey }), [userId, active, contactKey]);
  const latest = useRef(scope);
  latest.current = scope;
  const mounted = useRef(false);
  const sequence = useRef(0);
  const pending = useRef(false);
  const cancel = useCallback(() => { sequence.current++; pending.current = false; }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    cancel();
    return () => { mounted.current = false; cancel(); };
  }, [scope, cancel]);

  const openMessage = async (person: NavigationContact) => {
    if (!mounted.current || latest.current !== scope || !active || !userId || userId === person.id || pending.current ||
      !contacts.some(item => item.id === person.id && item.bookingId === person.bookingId)) return;
    pending.current = true;
    const request = ++sequence.current;
    const version = getTokenSessionVersion();
    const current = () => mounted.current && latest.current === scope && request === sequence.current &&
      version === getTokenSessionVersion();
    let navigated = false;
    try {
      // The booking endpoint checks membership and reuses its existing conversation.
      let conversation = person.bookingId ? undefined :
        findDirectConversationWithUser(conversations, userId, person.id);
      if (!person.bookingId && !conversation) {
        let page = 1;
        while (current()) {
          const response = await loadConversations({ page, limit: 50 }).unwrap();
          if (!current()) return;
          conversation = findDirectConversationWithUser(response.data, userId, person.id);
          if (!Number.isSafeInteger(response.meta.limit) || response.meta.limit < 1 ||
            !Number.isSafeInteger(response.meta.total) || response.meta.total < 0) throw new Error('Invalid pagination');
          if (conversation || !response.data.length || page * response.meta.limit >= response.meta.total) break;
          page++;
        }
      }
      if (!current()) return;
      conversation ??= await createConversation({
        participantIds: [person.id], ...(person.bookingId ? { bookingId: person.bookingId } : {}),
      }).unwrap();
      if (!current()) return;
      if (!conversation.id) throw new Error('Missing conversation');
      onClose();
      router.push({ pathname: '/chat/[id]', params: { id: conversation.id, title: person.name } });
      navigated = true;
    } catch {
      if (current()) throw new Error('Impossible d’ouvrir la messagerie. Vérifiez votre connexion et réessayez.');
    } finally {
      if (!navigated && request === sequence.current) pending.current = false;
    }
  };
  return { openMessage, cancel, canMessage: Boolean(active && userId), userId };
}
