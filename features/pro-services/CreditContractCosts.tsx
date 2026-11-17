import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { AssetCredit } from '@/store/api/assetCreditApi';
import { s } from '@/features/pro-services/ServiceLayout';
import { creditMoney } from './assetCreditModel';
import { hasValidCostDisclosure } from './creditCostDisclosure';

export function CreditContractCosts({ credit }: { credit: AssetCredit }) {
  const [expanded, setExpanded] = useState(false);
  if (!hasValidCostDisclosure(credit)) return <Text style={s.error}>Conditions incomplètes. Actualisez le contrat avant de l’accepter.</Text>;
  if (!credit.costDisclosureVersion) return <Text style={s.text}>Le détail des frais et des échéances de cet ancien contrat figure dans ses conditions.</Text>;
  const rows = credit.installments ?? [];
  const displayed = expanded ? rows : rows.filter((_, i) => i === 0 || i === rows.length - 1);
  const period = credit.installmentPeriod === 'week' ? 'semaine' : 'mois';
  return <View style={{ gap: 10 }}>
    <View style={s.row}><Text style={[s.text, s.flex]}>Prix du bien</Text><Text style={s.label}>{creditMoney(credit.cashPriceMinor!)}</Text></View>
    <View style={s.row}><Text style={[s.text, s.flex]}>Frais de crédit inclus</Text><Text style={s.label}>{creditMoney(credit.creditFeeMinor!)}</Text></View>
    <Text style={s.text}>Frais fixés dans cette offre, déjà compris dans le total. Ils ne s’ajoutent pas à chaque trajet.</Text>
    {rows.length ? <View style={s.section}>
      <Text style={s.label}>Vos échéances minimums</Text>
      <Text style={s.text}>{rows.length} versement{rows.length > 1 ? 's' : ''}, un par {period}, à partir de la remise du bien.</Text>
      {displayed.map(row => <View key={row.ordinal} style={s.row}>
        <Text style={[s.text, s.flex]}>{row.dueAt ? new Date(row.dueAt).toLocaleDateString('fr-FR') : `${row.ordinal} ${period}${period === 'semaine' && row.ordinal > 1 ? 's' : ''} après remise`}</Text>
        <View><Text style={s.label}>{creditMoney(row.amountMinor)}</Text>
          {row.dueAt && <Text style={s.text}>{row.remainingMinor ? `Reste ${creditMoney(row.remainingMinor)}` : 'Réglé'}</Text>}</View>
      </View>)}
      {rows.length > 2 && <TouchableOpacity style={s.option} accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(v => !v)}>
        <Text style={s.label}>{expanded ? 'Réduire les dates' : `Voir les ${rows.length} échéances`}</Text>
      </TouchableOpacity>}
      {!!credit.minimumDueMinor && <Text style={s.error}>À compléter à ce jour : {creditMoney(credit.minimumDueMinor)}.</Text>}
      <Text style={s.text}>Les montants déjà remboursés via vos trajets ou votre solde comptent dans ces échéances. Complétez seulement le manque depuis votre solde. Pas de double paiement ni de prélèvement automatique à date fixe.</Text>
    </View> : <Text style={s.text}>Cette offre ne prévoit pas d’échéance minimum à date fixe.</Text>}
  </View>;
}
