import { useDialog } from '@/components/ui/DialogProvider';
import { useGetMyReferralSummaryQuery, useRequestReferralWithdrawalMutation, useLazyGetMyReferralWithdrawalQuery } from '@/store/api/referralApi';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { copyReferralLink, shareReferralLink } from '@/utils/shareReferralLink';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import type { ReferralSummary } from '@/types';
import { formatNumber } from '@/features/referrals/referralModel';
import { validateReferralWithdrawal } from '@/features/referrals/referralWithdrawalValidation';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { normalizePayoutPhone } from '@/features/driver-earnings/payoutModel';
import { readReferralWithdrawalIntent, prepareReferralWithdrawalIntent, recordReferralWithdrawal,
  clearReferralWithdrawalIntent, type ReferralWithdrawalIntent } from '@/services/referralWithdrawalIntent';

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
  const user = useAppSelector(selectUser);
  const [readWithdrawal] = useLazyGetMyReferralWithdrawalQuery();
  const [pendingWithdrawal, setPendingWithdrawal] = useState<ReferralWithdrawalIntent | null>(null);
  const [withdrawalBusy, setWithdrawalBusy] = useState(false);
  const mounted = useRef(true);
  const owner = useRef(user?.id); owner.current = user?.id;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    const version = getTokenSessionVersion();
    setPendingWithdrawal(null);
    if (user?.id) void readReferralWithdrawalIntent(user.id).then(intent => {
      if (active && version === getTokenSessionVersion()) setPendingWithdrawal(intent);
    }).catch(() => undefined); // Submission reads again and fails closed on storage errors.
    return () => { active = false; };
  }, [user?.id]);
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
    if (withdrawalInFlight.current || !user?.id || !mounted.current || owner.current !== user.id) return;
    Keyboard.dismiss();
    withdrawalInFlight.current = true;
    setWithdrawalBusy(true);
    const version = getTokenSessionVersion();
    const current = () => mounted.current && owner.current === user.id && version === getTokenSessionVersion();
    let intent: ReferralWithdrawalIntent | null = null;
    let resumed = false;
    try {
      intent = await readReferralWithdrawalIntent(user.id);
      if (!current()) return;
      resumed = Boolean(intent);
      if (!intent) {
        const validation = validateReferralWithdrawal(withdrawalTokens, summary);
        if (!validation.valid) {
          showDialog({ variant: 'warning', title: validation.title, message: validation.message });
          return;
        }
        let currentSummary: ReferralSummary;
        try {
          currentSummary = await refetchSummary().unwrap();
        } catch {
          if (!current()) return;
          showDialog({ variant: 'warning', title: 'Solde indisponible', message: 'Impossible de vérifier votre solde disponible. Aucun retrait n’a été envoyé. Réessayez après actualisation.' });
          return;
        }
        if (!current()) return;
        const freshValidation = validateReferralWithdrawal(withdrawalTokens, currentSummary);
        if (!freshValidation.valid) {
          showDialog({ variant: 'warning', title: freshValidation.title, message: freshValidation.message });
          return;
        }
        const phone = normalizePayoutPhone(user.phone);
        if (!phone) {
          showDialog({ variant: 'warning', title: 'Numéro Mobile Money à vérifier', message: 'Vérifiez le numéro associé à votre compte avant de retirer vos gains.' });
          return;
        }
        const prepared = await prepareReferralWithdrawalIntent(user.id, freshValidation.tokens, phone);
        intent = prepared.intent;
        resumed = !prepared.created;
      }
      if (!current()) return;
      setPendingWithdrawal(intent);
      // Recovery does not revalidate the now-reserved balance or change the destination.
      const withdrawal = intent.withdrawalId
        ? await readWithdrawal(intent.withdrawalId, false).unwrap()
        : await requestWithdrawal({ tokens: intent.tokens, phone: intent.phone, idempotencyKey: intent.idempotencyKey }).unwrap();
      const pending = await recordReferralWithdrawal(intent, withdrawal);
      if (!current()) return;
      setPendingWithdrawal(pending);
      setWithdrawalTokens('');
      await refreshAll().catch(() => undefined);
      if (!current()) return;
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
      // Only a first, explicit validation rejection may release the local intent.
      // A restored intent, timeout, 5xx or malformed response always retains its key.
      const status = (error as { status?: unknown })?.status;
      if (intent && !resumed && (status === 400 || status === 422)) {
        await clearReferralWithdrawalIntent(intent).then(() => {
          if (current()) setPendingWithdrawal(null);
        }).catch(() => undefined);
      }
      if (!current()) return;
      await refreshAll().catch(() => undefined);
      if (!current()) return;
      showDialog({
        variant: 'danger',
        title: 'Retrait impossible',
        message: getApiErrorMessage(error, 'La confirmation du retrait n’a pas été reçue. « Vérifier mon retrait » reprend la même demande, sans créer un second versement.'),
      });
    } finally {
      withdrawalInFlight.current = false;
      if (mounted.current) setWithdrawalBusy(false);
    }
  };

  return {
    handleShare,
    handleWithdrawal,
    pendingWithdrawal: pendingWithdrawal?.userId === user?.id ? pendingWithdrawal : null,
    withdrawalBusy,
  };
}
