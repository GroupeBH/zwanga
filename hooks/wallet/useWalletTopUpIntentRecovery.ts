import { useEffect } from 'react';
import { readWalletTopUpIntent } from '@/features/wallet/topUpIntent';
import type { SubscriptionPaymentMethod } from '@/types';
import type { TopUpStage } from '@/features/wallet/walletTypes';

/** Restore an initiation whose HTTP response was lost, before the next explicit tap. */
export function useWalletTopUpIntentRecovery(userId: string | undefined, actions: {
  setTopUpAmount(value: string): void;
  setTopUpMethod(value: SubscriptionPaymentMethod): void;
  setTopUpPhone(value: string): void;
  setTopUpStage(value: TopUpStage): void;
  setTopUpStatusMessage(value: string): void;
}) {
  const { setTopUpAmount, setTopUpMethod, setTopUpPhone, setTopUpStage, setTopUpStatusMessage } = actions;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void readWalletTopUpIntent(userId).then(intent => {
      if (cancelled || !intent) return;
      setTopUpAmount(String(intent.payload.amount));
      setTopUpMethod(intent.payload.method);
      setTopUpPhone(intent.payload.phone ?? '');
      setTopUpStage('waiting_long');
      setTopUpStatusMessage('Recharge à vérifier. Appuyez pour reprendre la même recharge, sans payer une seconde fois.');
    }).catch(() => {
      if (!cancelled) setTopUpStatusMessage('Référence locale indisponible. Réessayez avant de lancer une recharge.');
    });
    return () => { cancelled = true; };
  }, [userId, setTopUpAmount, setTopUpMethod, setTopUpPhone, setTopUpStage, setTopUpStatusMessage]);
}
