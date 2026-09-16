import { formatWalletAmount, parsePositiveAmount, resolveRecipientPayload } from '../../features/wallet/walletModel';
import { WalletAction } from '../../features/wallet/walletTypes';
import { useDialog } from '@/components/ui/DialogProvider';
import { useTransferWalletPointsMutation } from '@/store/api/walletApi';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import React from 'react';
import { Keyboard } from 'react-native';

interface Params {
  transferAmount: string;
  transferRecipient: string;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  transferWalletPoints: ReturnType<typeof useTransferWalletPointsMutation>[0];
  transferNote: string;
  setTransferAmount: React.Dispatch<React.SetStateAction<string>>;
  setTransferRecipient: React.Dispatch<React.SetStateAction<string>>;
  setTransferNote: React.Dispatch<React.SetStateAction<string>>;
  setActiveModal: React.Dispatch<React.SetStateAction<WalletAction | null>>;
  refreshAll: () => Promise<void>;
}

export function useWalletTransfer({
  transferAmount,
  transferRecipient,
  showDialog,
  transferWalletPoints,
  transferNote,
  setTransferAmount,
  setTransferRecipient,
  setTransferNote,
  setActiveModal,
  refreshAll,
}: Params) {
  const handleTransfer = async () => {
    Keyboard.dismiss();
    const amount = parsePositiveAmount(transferAmount);
    const recipientPayload = resolveRecipientPayload(transferRecipient);

    if (!amount) {
      showDialog({
        variant: 'warning',
        title: 'Nombre de jetons invalide',
        message: 'Entrez le nombre de jetons a partager.',
      });
      return;
    }

    if (!recipientPayload) {
      showDialog({
        variant: 'warning',
        title: 'Destinataire requis',
        message: 'Utilisez le téléphone +243, un email ou un identifiant utilisateur valide.',
      });
      return;
    }

    try {
      const response = await transferWalletPoints({
        amount,
        ...recipientPayload,
        note: transferNote.trim() || undefined,
      }).unwrap();
      const recipientName =
        [response.recipient.firstName, response.recipient.lastName].filter(Boolean).join(' ') ||
        response.recipient.phone ||
        response.recipient.email ||
        'utilisateur';

      setTransferAmount('');
      setTransferRecipient('');
      setTransferNote('');
      setActiveModal(null);
      await refreshAll();

      showDialog({
        variant: 'success',
        title: 'Jetons partages',
        message: `${formatWalletAmount(response.amount, response.currency)} envoyés à ${recipientName}.`,
      });
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: 'Transfert impossible',
        message: getApiErrorMessage(error, 'Impossible de partager ces jetons pour le moment.'),
      });
    }
  };

  return {
    handleTransfer,
  };
}
