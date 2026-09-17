import { useDialog } from '@/components/ui/DialogProvider';
import { useDeleteConversationMessageMutation } from '@/store/api/messageApi';
import { updateMessageCache } from '@/store/api/messages/updateMessageCache';
import { useAppDispatch } from '@/store/hooks';
import { Message } from '@/types';
import React, { useCallback } from 'react';
import type { User } from '@/types';

interface Params {
  user: User | null;
  setEditingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  deleteMessageMutation: ReturnType<typeof useDeleteConversationMessageMutation>[0];
  conversationId: string;
  dispatch: ReturnType<typeof useAppDispatch>;
  isCurrent: () => boolean;
}

export function useChatMessageActions({
  user,
  setEditingMessageId,
  setMessage,
  showDialog,
  deleteMessageMutation,
  conversationId,
  dispatch,
  isCurrent,
}: Params) {
  const handleEditMessage = useCallback((msg: Message) => {
    if (!isCurrent() || msg.senderId !== user?.id) return;
    setEditingMessageId(msg.id);
    setMessage(msg.content);
  }, [isCurrent, user?.id, setEditingMessageId, setMessage]);

  const handleDeleteMessage = useCallback((msg: Message) => {
    if (!isCurrent() || msg.senderId !== user?.id) return;

    showDialog({
      title: 'Supprimer le message',
      message: 'Voulez-vous vraiment supprimer ce message ? Cette action est irréversible.',
      variant: 'danger',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Supprimer',
          variant: 'primary',
          onPress: async () => {
            if (!isCurrent()) return;
            try {
              await deleteMessageMutation({ messageId: msg.id, conversationId }).unwrap();
              updateMessageCache(dispatch, conversationId, { deletedId: msg.id });
            } catch (error) {
              console.warn('Erreur lors de la suppression du message:', error);
            }
          },
        },
      ],
    });
  }, [isCurrent, user?.id, showDialog, deleteMessageMutation, conversationId, dispatch]);

  return {
    handleEditMessage,
    handleDeleteMessage,
  };
}
