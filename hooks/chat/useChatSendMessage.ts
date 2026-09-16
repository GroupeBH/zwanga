import { trackEvent } from '@/services/analytics';
import {
  messageApi,
  useEditConversationMessageMutation,
  useSendConversationMessageMutation,
} from '@/store/api/messageApi';
import { useAppDispatch } from '@/store/hooks';
import { addMessage as addMessageAction } from '@/store/slices/messagesSlice';
import React from 'react';
import type { Conversation } from '@/types';

interface Params {
  message: string;
  conversationId: string;
  sending: boolean;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  editingMessageId: string | null;
  editMessageMutation: ReturnType<typeof useEditConversationMessageMutation>[0];
  setEditingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  dispatch: ReturnType<typeof useAppDispatch>;
  sendMessageMutation: ReturnType<typeof useSendConversationMessageMutation>[0];
  conversation: Conversation | undefined;
}

export function useChatSendMessage({
  message,
  conversationId,
  sending,
  setMessage,
  editingMessageId,
  editMessageMutation,
  setEditingMessageId,
  dispatch,
  sendMessageMutation,
  conversation,
}: Params) {
  const handleSend = async () => {
    if (!message.trim() || !conversationId || sending) {
      return;
    }

    const content = message.trim();
    setMessage('');

    // Mode édition
    if (editingMessageId) {
      try {
        const updated = await editMessageMutation({ messageId: editingMessageId, content, conversationId }).unwrap();
        setEditingMessageId(null);
        dispatch(
          messageApi.util.updateQueryData('getConversationMessages', { conversationId }, (draft) => {
            const index = draft.findIndex((m) => m.id === updated.id);
            if (index !== -1) {
              draft[index] = updated;
            }
          }),
        );
      } catch (error) {
        console.warn('Erreur lors de la modification du message:', error);
      }
      return;
    }

    // Mode envoi normal
    try {
      const saved = await sendMessageMutation({ conversationId, content }).unwrap();
      void trackEvent('message_sent', {
        conversation_id: conversationId,
        has_booking: Boolean(conversation?.bookingId),
        content_length: content.length,
      });
      dispatch(
        messageApi.util.updateQueryData('getConversationMessages', { conversationId }, (draft) => {
          if (!draft.some((message) => message.id === saved.id)) draft.push(saved);
        }),
      );
      dispatch(
        addMessageAction({
          conversationId,
          message: saved,
          isMine: true,
        }),
      );
    } catch (error) {
      console.warn('Erreur lors de l\'envoi du message:', error);
      setMessage(content);
    }
  };

  return {
    handleSend,
  };
}
