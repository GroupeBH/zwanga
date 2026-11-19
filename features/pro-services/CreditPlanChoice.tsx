import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AssetCredit } from '@/store/api/assetCreditApi';
import { s } from '@/features/pro-services/ServiceLayout';
import { creditMoney } from './assetCreditModel';
import { hasValidCostDisclosure } from './creditCostDisclosure';

export function creditWithSelectedPlan(credit: AssetCredit, id: string): AssetCredit | null {
  if (!credit.repaymentPlans?.length) return credit;
  const plan = credit.repaymentPlans.find(p => p.id === id);
  const preview = credit.repaymentPlanPreviews?.find(p => p.id === id && p.months === plan?.months);
  if (!plan || !preview) return null;
  const selected = { ...credit, installmentCount: plan.months, installmentPeriod: 'month' as const,
    installments: preview.installments, minimumDueMinor: preview.minimumDueMinor };
  return hasValidCostDisclosure(selected) ? selected : null;
}

export function CreditPlanChoice({ credit, selected, onSelect, disabled }: {
  credit: AssetCredit; selected: string; onSelect: (id: string) => void; disabled: boolean;
}) {
  if (credit.status !== 'offered' || !credit.repaymentPlans?.length) return null;
  return <View style={{ gap: 10 }} accessibilityRole="radiogroup">
    <Text style={s.label}>Choisissez vos mensualités</Text>
    <Text style={s.text}>Même prix total et même pourcentage sur les trajets. Seule la durée change.</Text>
    {credit.repaymentPlans.map(plan => {
      const c = creditWithSelectedPlan(credit, plan.id);
      const rows = c?.installments;
      return <TouchableOpacity key={plan.id} style={[s.notice, { borderWidth: 1, borderColor: selected === plan.id ? '#C34412' : '#E3E8F0' }]}
        accessibilityRole="radio" accessibilityLabel={`${plan.months} mois`} accessibilityState={{ checked: selected === plan.id, disabled: disabled || !c }}
        disabled={disabled || !c} onPress={() => { if (!disabled && c) onSelect(plan.id); }}>
        <View style={s.row}><Text style={[s.label, s.flex]}>{plan.months} mois</Text><Ionicons name={selected === plan.id ? 'radio-button-on' : 'radio-button-off'} color="#C34412" size={22} /></View>
        {rows?.length ? <><Text style={s.label}>{creditMoney(rows[0].amountMinor)} / mois</Text>
          {rows[rows.length - 1].amountMinor !== rows[0].amountMinor && <Text style={s.text}>Dernier versement : {creditMoney(rows[rows.length - 1].amountMinor)}</Text>}
          <Text style={s.text}>Total : {creditMoney(c!.principalMinor)} · frais inclus : {creditMoney(c!.creditFeeMinor!)}</Text></> : <Text style={s.error}>Formule à actualiser.</Text>}
      </TouchableOpacity>;
    })}
  </View>;
}
