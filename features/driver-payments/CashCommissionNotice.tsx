import React from 'react';
import { Text } from 'react-native';
import { Colors } from '@/constants/styles';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { useDriverFinanceSummaryQuery } from '@/store/api/driverFinanceApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { estimateCashCommission } from '@/utils/cashCommission';

export function CashCommissionNotice({ amount, confirmed = false }: { amount: number; confirmed?: boolean }) {
  const user = useAppSelector(selectUser);
  const reads = useDisplayReadsEnabled(useScreenIsActive() && Boolean(user?.id));
  const { currentData: finance, isError, isFetching } = useDriverFinanceSummaryQuery(user?.id ?? '', displayReadOptions(reads));
  const estimate = reads && !isError && !isFetching ? estimateCashCommission(finance, amount) : null;
  const format = (value: number) => value.toLocaleString('fr-FR');
  let message = 'Commission cash : vérification au moment de l’acceptation.';
  if (estimate && finance) {
    if (finance.cash.debtTokens > 0) {
      message = `${format(finance.cash.debtTokens)} jetons dus (${format(finance.cash.debtAmount ?? finance.cash.debtTokens * finance.cash.moneyPerToken)} FC). Tolérance cumulée : ${finance.cash.debtLimitTokens ?? 25} jetons. ${confirmed ? 'Les courses confirmées peuvent se terminer.' : estimate.allowed ? 'Cette commission reste dans la limite autorisée.' : 'Ce nouveau paiement cash dépasse la capacité disponible. Rechargez.'} Tous les jetons reçus peuvent couvrir ce dû.`;
    } else if (confirmed) {
      message = 'Commission cash réservée. Le portefeuille affiche votre réserve actualisée.';
    } else if (!estimate.allowed) {
      message = 'Réserve cash insuffisante ou bloquée. Rechargez avant d’accepter.';
    } else {
      message = `Commission cash de 5 % : ${format(estimate.required)} jetons.`;
      if (estimate.debt > 0) message += ` Dette totale estimée : ${format(estimate.totalDebt)} jetons, dans la limite de ${finance.cash.debtLimitTokens ?? 25}.`;
    }
  }
  return <Text accessibilityLiveRegion="polite" style={{ fontSize: 13, lineHeight: 19, color: Colors.primaryDark }}>{message}</Text>;
}
