import { formatWalletAmount, parsePositiveAmount, resolveRecipientPayload } from '../../features/wallet/walletModel';
import { WalletAction } from '../../features/wallet/walletTypes';
import { useDialog } from '@/components/ui/DialogProvider';
import { useTransferWalletPointsMutation } from '@/store/api/walletApi';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import React, { useEffect, useRef } from 'react';
import { clearWalletTransferIntent, prepareWalletTransferIntent, readWalletTransferIntent,
  PendingWalletTransferError } from '@/services/walletTransferIntent';
import type { useWalletScreenScope } from './useWalletScreenScope';
import { Keyboard } from 'react-native';

interface Params {
  userId?: string;
  captureScope: ReturnType<typeof useWalletScreenScope>;
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
  userId,
  captureScope,
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
  const inFlight = useRef(false);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const current = captureScope();
    void readWalletTransferIntent(userId).then(intent => {
      if (cancelled || !current() || !intent) return;
      setTransferAmount(value => value || String(intent.payload.amount));
      setTransferRecipient(value => value || intent.payload.recipientPhone || intent.payload.recipientEmail || intent.payload.recipientUserId || '');
      setTransferNote(value => value || intent.payload.note || '');
    }).catch(() => { /* Submission will fail closed if storage is unavailable. */ });
    return () => { cancelled = true; };
  }, [userId, captureScope, setTransferAmount, setTransferRecipient, setTransferNote]);
  const handleTransfer = async () => {
    const isCurrent = captureScope();
    if (!userId || inFlight.current || !isCurrent()) return;
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

    inFlight.current = true;
    let intent: Awaited<ReturnType<typeof prepareWalletTransferIntent>> | undefined;
    let sent = false;
    try {
      intent = await prepareWalletTransferIntent(userId, {
        amount,
        ...recipientPayload,
        note: transferNote.trim() || undefined,
      });
      if (!isCurrent()) return;
      sent = true;
      const response = await transferWalletPoints({ ...intent.payload, idempotencyKey: intent.idempotencyKey }).unwrap();
      // If clearing storage fails, keep the key: retrying returns the same receipt.
      await clearWalletTransferIntent(intent).catch(() => undefined);
      if (!isCurrent()) return;
      const recipientName =
        [response.recipient.firstName, response.recipient.lastName].filter(Boolean).join(' ') ||
        response.recipient.phone ||
        response.recipient.email ||
        'utilisateur';

      setTransferAmount('');
      setTransferRecipient('');
      setTransferNote('');
      setActiveModal(null);
      // A delayed/failed balance refresh must not turn a confirmed transfer into failure.
      void refreshAll().catch(() => undefined);

      showDialog({
        variant: 'success',
        title: 'Jetons partages',
        message: `${formatWalletAmount(response.amount, response.currency)} envoyés à ${recipientName}.`,
      });
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof PendingWalletTransferError) {
        const pending = error.intent.payload;
        showDialog({ variant: 'warning', title: 'Transfert à confirmer',
          message: 'Reprenez le transfert précédent avant d’en créer un autre. La même référence sera utilisée pour éviter un double débit.',
          actions: [{ label: 'Reprendre', variant: 'primary', onPress: () => {
            if (!isCurrent()) return;
            setTransferAmount(String(pending.amount));
            setTransferRecipient(pending.recipientPhone || pending.recipientEmail || pending.recipientUserId || '');
            setTransferNote(pending.note || '');
          } }] });
        return;
      }
      const status = (error as { status?: unknown })?.status;
      // A retry can be refused after an earlier request committed (e.g. auth or
      // recipient availability changed). Never discard that ambiguous receipt key.
      const definitive = !intent?.resumed && typeof status === 'number' && [400, 401, 403, 404, 422, 429].includes(status);
      if (intent && definitive) await clearWalletTransferIntent(intent).catch(() => undefined);
      if (!isCurrent()) return;
      const uncertain = sent && !definitive;
      showDialog({
        variant: uncertain ? 'warning' : 'danger',
        title: uncertain ? 'Transfert à vérifier' : 'Transfert impossible',
        message: uncertain ? 'Ce transfert n’est pas encore confirmé dans l’application. Réessayez avec les mêmes informations : la référence conservée empêche un deuxième débit. Vous pouvez aussi vérifier votre historique.'
          : getApiErrorMessage(error, 'Impossible de partager ces jetons pour le moment.'),
      });
    } finally {
      inFlight.current = false;
    }
  };

  return {
    handleTransfer,
  };
}
