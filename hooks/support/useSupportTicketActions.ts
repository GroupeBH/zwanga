import { buildApiErrorMessage, type SupportContactPreference } from '@/components/support/supportData';
import { useDialog } from '@/components/ui/DialogProvider';
import {
  useCreateSupportTicketMutation,
  useGetMySupportTicketsQuery,
  useGetSupportConfigQuery,
  useGetSupportFaqQuery,
} from '@/store/api/supportApi';
import type { SupportTicketCategory } from '@/types';
import React from 'react';

interface Params {
  setTicketSubject: React.Dispatch<React.SetStateAction<string>>;
  setTicketMessage: React.Dispatch<React.SetStateAction<string>>;
  setTicketCategory: React.Dispatch<React.SetStateAction<SupportTicketCategory>>;
  setShowTicketModal: React.Dispatch<React.SetStateAction<boolean>>;
  ticketSubject: string;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  ticketMessage: string;
  createSupportTicket: ReturnType<typeof useCreateSupportTicketMutation>[0];
  ticketCategory: SupportTicketCategory;
  persistFavoriteContact: (key: SupportContactPreference) => Promise<void>;
  refetchTickets: ReturnType<typeof useGetMySupportTicketsQuery>['refetch'];
  refetchSupportConfig: ReturnType<typeof useGetSupportConfigQuery>['refetch'];
  refetchFaq: ReturnType<typeof useGetSupportFaqQuery>['refetch'];
}

export function useSupportTicketActions({
  setTicketSubject,
  setTicketMessage,
  setTicketCategory,
  setShowTicketModal,
  ticketSubject,
  showDialog,
  ticketMessage,
  createSupportTicket,
  ticketCategory,
  persistFavoriteContact,
  refetchTickets,
  refetchSupportConfig,
  refetchFaq,
}: Params) {
  const resetTicketForm = () => {
    setTicketSubject('');
    setTicketMessage('');
    setTicketCategory('general');
  };

  const handleCloseTicketModal = () => {
    setShowTicketModal(false);
    resetTicketForm();
  };

  const handleSubmitTicket = async () => {
    if (!ticketSubject.trim()) {
      showDialog({
        variant: 'warning',
        title: 'Sujet requis',
        message: 'Ajoutez un sujet simple pour aider le support à comprendre votre besoin.',
      });
      return;
    }

    if (!ticketMessage.trim()) {
      showDialog({
        variant: 'warning',
        title: 'Message requis',
        message: 'Expliquez en quelques phrases ce qui vous bloque.',
      });
      return;
    }

    try {
      await createSupportTicket({
        subject: ticketSubject.trim(),
        message: ticketMessage.trim(),
        category: ticketCategory,
        priority: 'medium',
      }).unwrap();

      await persistFavoriteContact('ticket');
      handleCloseTicketModal();
      refetchTickets();

      showDialog({
        variant: 'success',
        title: 'Ticket envoyé',
        message: 'Votre demande a bien été envoyée. Vous retrouverez son statut dans cette page.',
      });
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: 'Envoi impossible',
        message: buildApiErrorMessage(
          error,
          "Le ticket n'a pas pu être créé. Réessayez dans quelques instants.",
        ),
      });
    }
  };

  const handleRefresh = async () => {
    await Promise.allSettled([refetchSupportConfig(), refetchFaq(), refetchTickets()]);
  };

  return {
    handleRefresh,
    handleCloseTicketModal,
    handleSubmitTicket,
  };
}
