import { chatSocket } from '@/services/chatSocket';
import { updateMessageCache } from '@/store/api/messages/updateMessageCache';
import type { useAppDispatch } from '@/store/hooks';
import { addMessage } from '@/store/slices/messagesSlice';
import { baseApi } from '@/store/api/baseApi';
import { useEffect } from 'react';

type Props = {
  enabled: boolean; conversationId: string; bookingId?: string | null; userId?: string;
  dispatch: ReturnType<typeof useAppDispatch>; isCurrent: () => boolean;
};
export function useChatRealtime({ enabled, conversationId, bookingId, userId, dispatch, isCurrent }: Props) {
  useEffect(() => {
    if (!enabled || !conversationId) return;
    let cancelled = false;
    const unsubscribe = chatSocket.subscribeToMessages(incoming => {
      if (cancelled || !isCurrent() || !incoming || incoming.conversationId !== conversationId
        || typeof incoming.id !== 'string' || typeof incoming.content !== 'string') return;
      updateMessageCache(dispatch, conversationId, { message: incoming });
      dispatch(addMessage({ conversationId, message: incoming, isMine: incoming.senderId === userId }));
    });
    const stopReconnect = chatSocket.subscribeToReconnect(() => {
      if (!cancelled && isCurrent()) dispatch(baseApi.util.invalidateTags([
        { type: 'Message', id: conversationId }, { type: 'Conversation', id: conversationId },
      ]));
    });
    // Subscription precedes joining so the first message cannot be lost during connection.
    if (bookingId) void chatSocket.joinBookingRoom(bookingId).catch(error => {
      if (__DEV__ && !cancelled) console.warn('[Chat] Connexion indisponible:', error);
    });
    return () => {
      cancelled = true;
      stopReconnect();
      unsubscribe();
      // Room ownership is registered synchronously, including while authentication is pending.
      if (bookingId) void chatSocket.leaveBookingRoom(bookingId);
    };
  }, [enabled, conversationId, bookingId, userId, dispatch, isCurrent]);
}
