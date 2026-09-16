import { useDialog } from '@/components/ui/DialogProvider';
import { messageApi, useDeleteConversationMessageMutation } from '@/store/api/messageApi';
import { useAppDispatch } from '@/store/hooks';
import { Message } from '@/types';
import React from 'react';
import type { User } from '@/types';

interface Params {
  user: User | null;
  setEditingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  deleteMessageMutation: ReturnType<typeof useDeleteConversationMessageMutation>[0];
  conversationId: string;
  dispatch: ReturnType<typeof useAppDispatch>;
}

export function useChatMessageActions({
  user,
  setEditingMessageId,
  setMessage,
  showDialog,
  deleteMessageMutation,
  conversationId,
  dispatch,
}: Params) {
  const handleEditMessage = (msg: Message) => {
    if (msg.senderId !== user?.id) return;
    setEditingMessageId(msg.id);
    setMessage(msg.content);
  };

  const handleDeleteMessage = (msg: Message) => {
    if (msg.senderId !== user?.id) return;

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
            try {
              await deleteMessageMutation({ messageId: msg.id, conversationId }).unwrap();
              dispatch(
                messageApi.util.updateQueryData('getConversationMessages', { conversationId }, (draft) => {
                  const index = draft.findIndex((m) => m.id === msg.id);
                  if (index !== -1) {
                    draft.splice(index, 1);
                  }
                }),
              );
            } catch (error) {
              console.warn('Erreur lors de la suppression du message:', error);
            }
          },
        },
      ],
    });
  };

  return {
    handleEditMessage,
    handleDeleteMessage,
  };
}
