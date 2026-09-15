import { useDialog } from '@/components/ui/DialogProvider';
import { useGetMyReferralSummaryQuery, useRequestReferralWithdrawalMutation } from '@/store/api/referralApi';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { copyReferralLink, shareReferralLink } from '@/utils/shareReferralLink';
import React from 'react';
import { Keyboard } from 'react-native';
import type { ReferralSummary } from '@/types';
import { formatNumber } from '@/features/referrals/referralModel';

interface Params {
  isSharing: boolean;
  setIsSharing: React.Dispatch<React.SetStateAction<boolean>>;
  summary: ReferralSummary | undefined;
  refetchSummary: ReturnType<typeof useGetMyReferralSummaryQuery>['refetch'];
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  withdrawalTokens: string;
  requestWithdrawal: ReturnType<typeof useRequestReferralWithdrawalMutation>[0];
  setWithdrawalTokens: React.Dispatch<React.SetStateAction<string>>;
  refreshAll: () => Promise<void>;
}

export function useReferralActions({
  isSharing,
  setIsSharing,
  summary,
  refetchSummary,
  showDialog,
  withdrawalTokens,
  requestWithdrawal,
  setWithdrawalTokens,
  refreshAll,
}: Params) {
  const handleShare = async () => {
    if (isSharing) return;
    setIsSharing(true);
    let fallbackLink = summary?.shareLink;
    try {
      const currentSummary = summary ?? (await refetchSummary().unwrap());
      fallbackLink = currentSummary.shareLink;
      await shareReferralLink(currentSummary.shareLink);
    } catch (error) {
      console.warn('[referrals] Partage natif indisponible:', error);
      showDialog({
        variant: 'danger',
        title: 'Partage indisponible',
        message:
          "Le menu de partage n'a pas pu s'ouvrir. Vous pouvez copier le lien et le coller dans WhatsApp, SMS ou une autre application.",
        actions: fallbackLink
          ? [
              {
                label: 'Copier le lien',
                variant: 'primary',
                onPress: async () => {
                  await copyReferralLink(fallbackLink);
                  showDialog({
                    variant: 'success',
                    title: 'Lien copié',
                    message: "Le lien d'invitation est dans votre presse-papiers.",
                  });
                },
              },
              { label: 'Fermer', variant: 'ghost' },
            ]
          : [{ label: 'Fermer', variant: 'primary' }],
      });
    } finally {
      setIsSharing(false);
    }
  };

  const handleWithdrawal = async () => {
    Keyboard.dismiss();
    const tokens = Number(withdrawalTokens.replace(',', '.'));
    if (!summary || !Number.isFinite(tokens) || tokens <= 0) {
      showDialog({
        variant: 'warning',
        title: 'Montant invalide',
        message: 'Entrez le nombre de jetons à retirer.',
      });
      return;
    }
    if (tokens < summary.withdrawal.minimumTokens) {
      showDialog({
        variant: 'warning',
        title: 'Minimum non atteint',
        message: `Le retrait minimum est de ${formatNumber(summary.withdrawal.minimumTokens)} jetons.`,
      });
      return;
    }
    if (tokens > summary.balances.availableTokens) {
      showDialog({
        variant: 'warning',
        title: 'Solde insuffisant',
        message: 'Votre solde disponible ne couvre pas ce retrait.',
      });
      return;
    }
    if (!summary.withdrawal.kycApproved) {
      showDialog({
        variant: 'warning',
        title: 'Vérification requise',
        message: 'Vérifiez votre identité avant de retirer vos gains.',
      });
      return;
    }

    try {
      const withdrawal = await requestWithdrawal({ tokens }).unwrap();
      setWithdrawalTokens('');
      await refreshAll();
      showDialog({
        variant: 'success',
        title: 'Retrait transmis',
        message: `FlexPay traite ${formatNumber(withdrawal.amount)} ${withdrawal.currency} vers votre numéro Mobile Money.`,
      });
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: 'Retrait impossible',
        message: getApiErrorMessage(error, 'Impossible de lancer ce retrait pour le moment.'),
      });
    }
  };

  return {
    handleShare,
    handleWithdrawal,
  };
}
