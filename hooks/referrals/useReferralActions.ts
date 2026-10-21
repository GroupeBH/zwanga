import { useDialog } from '@/components/ui/DialogProvider';
import { useGetMyReferralSummaryQuery, useRequestReferralWithdrawalMutation } from '@/store/api/referralApi';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { copyReferralLink, shareReferralLink } from '@/utils/shareReferralLink';
import React, { useRef } from 'react';
import { Keyboard } from 'react-native';
import type { ReferralSummary } from '@/types';
import { formatNumber } from '@/features/referrals/referralModel';
import { validateReferralWithdrawal } from '@/features/referrals/referralWithdrawalValidation';

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
  const withdrawalInFlight = useRef(false);
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
    if (withdrawalInFlight.current) return;
    Keyboard.dismiss();
    const validation = validateReferralWithdrawal(withdrawalTokens, summary);
    if (!validation.valid) {
      showDialog({ variant: 'warning', title: validation.title, message: validation.message });
      return;
    }
    withdrawalInFlight.current = true;
    try {
      let currentSummary: ReferralSummary;
      try {
        currentSummary = await refetchSummary().unwrap();
      } catch {
        showDialog({ variant: 'warning', title: 'Solde indisponible', message: 'Impossible de vérifier votre solde disponible. Aucun retrait n’a été envoyé. Réessayez après actualisation.' });
        return;
      }
      const freshValidation = validateReferralWithdrawal(withdrawalTokens, currentSummary);
      if (!freshValidation.valid) {
        showDialog({ variant: 'warning', title: freshValidation.title, message: freshValidation.message });
        return;
      }
      const withdrawal = await requestWithdrawal({ tokens: freshValidation.tokens }).unwrap();
      setWithdrawalTokens('');
      await refreshAll().catch(() => undefined);
      if (withdrawal.status === 'failed' || withdrawal.status === 'cancelled') {
        showDialog({ variant: 'danger', title: 'Retrait non abouti', message: withdrawal.failureReason || 'Le versement n’a pas abouti. Consultez l’historique et votre solde disponible avant de réessayer.' });
        return;
      }
      showDialog({
        variant: 'success',
        title: withdrawal.status === 'succeeded' ? 'Retrait effectué' : 'Retrait transmis',
        message: withdrawal.status === 'succeeded'
          ? `Le versement de ${formatNumber(withdrawal.amount)} ${withdrawal.currency} a été confirmé.`
          : `Le prestataire traite le versement de ${formatNumber(withdrawal.amount)} ${withdrawal.currency} vers votre numéro Mobile Money.`,
      });
    } catch (error) {
      await refreshAll().catch(() => undefined);
      showDialog({
        variant: 'danger',
        title: 'Retrait impossible',
        message: getApiErrorMessage(error, 'La confirmation du retrait n’a pas été reçue. Vérifiez l’historique avant de réessayer pour éviter un double retrait.'),
      });
    } finally {
      withdrawalInFlight.current = false;
    }
  };

  return {
    handleShare,
    handleWithdrawal,
  };
}
