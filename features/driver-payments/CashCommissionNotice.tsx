import React from 'react';
import { Text } from 'react-native';
import { Colors } from '@/constants/styles';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { useDriverFinanceSummaryQuery } from '@/store/api/driverFinanceApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { estimateCashCommission, hasCashCreditAllowance } from '@/utils/cashCommission';

export function CashCommissionNotice({ amount, confirmed = false }: { amount: number; confirmed?: boolean }) {
  const user = useAppSelector(selectUser);
  const reads = useDisplayReadsEnabled(useScreenIsActive() && Boolean(user?.id));
  const { currentData: finance, isError, isFetching } = useDriverFinanceSummaryQuery(user?.id ?? '', displayReadOptions(reads));
  const estimate = reads && !isError && !isFetching ? estimateCashCommission(finance, amount) : null;
  const format = (value: number) => value.toLocaleString('fr-FR');
  let message = 'Commission cash : vérification au moment de l’acceptation.';
  if (estimate && finance) {
    if (confirmed) {
      message = `Commission cash : 5 %. Reste dû : ${format(finance.cash.debtAmount ?? finance.cash.debtTokens * finance.cash.moneyPerToken)} FC. Les courses confirmées peuvent se terminer.`;
    } else {
      message = `Commission cash de 5 % : ${format(estimate.required)} jetons.`;
      if (estimate.allowed && hasCashCreditAllowance(finance)) {
        message += ` Avance unique : ${finance.cash.creditAllowance!.remainingTrips} trajet(s) disponible(s), en cours déduits. Commission due, pas offerte.`;
      }
      if (estimate.totalDebt > 0) message += ` Dette totale estimée : ${format(estimate.totalDebt)} jetons.`;
      if (!estimate.allowed) message += ' Régularisez le dû et rechargez avant un nouveau trajet cash.';
    }
    if (finance.cash.creditAllowance) {
      message += ` Trajets cash payés : ${finance.cash.creditAllowance.completedTrips}/6. Ensuite, réserve en jetons obligatoire.`;
    }
  }
  return <Text accessibilityLiveRegion="polite" style={{ fontSize: 13, lineHeight: 19, color: Colors.primaryDark }}>{message}</Text>;
}
