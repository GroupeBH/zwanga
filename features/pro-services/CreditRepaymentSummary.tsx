import React from 'react';
import { Text, View } from 'react-native';
import type { AssetCredit } from '@/store/api/assetCreditApi';
import { s } from '@/features/pro-services/ServiceLayout';

export function hasValidCreditRates(c: AssetCredit) {
  return c.policyVersion !== 'asset-credit-v2' || (
    Number.isInteger(c.repaymentBps) && c.repaymentBps! > 0 && c.repaymentBps! <= 9500
    && Number.isInteger(c.totalRepaymentBps) && c.totalRepaymentBps! >= c.repaymentBps! && c.totalRepaymentBps! <= 9500
    && c.commissionBps === 500
  );
}
const percent = (bps: number) => `${(bps / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

export function CreditRepaymentSummary({ credit: c }: { credit: AssetCredit }) {
  if (c.policyVersion !== 'asset-credit-v2') return null;
  // A settled contract can legitimately have no rate left in the current portfolio.
  if (['settled', 'declined', 'cancelled'].includes(c.status)) return null;
  if (!hasValidCreditRates(c)) return <Text accessibilityRole="alert" style={s.error}>
    Conditions à actualiser : vérifiez le total de vos crédits avant de continuer.
  </Text>;
  return <View style={s.notice}>
    <Text style={s.label}>{percent(c.repaymentBps!)} pour ce crédit</Text>
    <Text style={s.text}>Tous vos crédits : {percent(c.totalRepaymentBps!)} + commission : {percent(c.commissionBps!)}</Text>
    <Text style={s.label}>Total sur le revenu du trajet : {percent(c.totalRepaymentBps! + c.commissionBps!)}</Text>
    <Text style={s.text}>Après remise des biens, jusqu’au remboursement. Le total baisse quand un crédit est soldé.</Text>
  </View>;
}
