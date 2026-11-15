import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { AssetCredit } from '@/store/api/assetCreditApi';
import { s } from '@/features/pro-services/ServiceLayout';
import { creditMoney } from './assetCreditModel';
import { hasValidCreditRates } from './CreditRepaymentSummary';
import { parseProjectionFc, projectCredit } from './creditProjection';

/** This simulation does not schedule a debit, create a deadline or alter consent. */
export function CreditCostPreview({ credit }: { credit: AssetCredit }) {
  const [revenue, setRevenue] = useState('');
  const [extra, setExtra] = useState('');
  const [expanded, setExpanded] = useState(false);
  const principal = Number(credit.principalMinor);
  const paid = Number(credit.paidMinor);
  const remaining = Math.max(0, principal - paid);
  const gross = parseProjectionFc(revenue);
  const voluntary = extra.trim() ? parseProjectionFc(extra) : 0;
  const canEstimate = credit.policyVersion === 'asset-credit-v2' && hasValidCreditRates(credit);
  const projection = canEstimate && gross !== null && voluntary !== null
    ? projectCredit({ remainingMinor: remaining, repaymentBps: credit.repaymentBps!,
      weeklyRevenueMinor: gross, weeklyExtraMinor: voluntary }) : null;
  if (!Number.isSafeInteger(principal) || principal <= 0 || !Number.isSafeInteger(paid)
    || paid < 0 || paid > principal) return null;
  return <View style={{ gap: 12 }}>
    {remaining > 0 && !['declined', 'cancelled'].includes(credit.status) && <>
      <TouchableOpacity style={s.option} accessibilityRole="button" accessibilityState={{ expanded }}
        onPress={() => setExpanded(value => !value)}>
        <Text style={s.label}>{expanded ? 'Masquer la simulation' : 'Estimer mes remboursements →'}</Text>
      </TouchableOpacity>
      {expanded && <>
      <Text style={s.label}>En combien de temps ?</Text>
      {canEstimate ? <>
        <Text style={s.text}>Estimez vos recettes de trajets par semaine, avant commission et remboursements.</Text>
        <TextInput style={s.input} accessibilityLabel="Recettes de trajets par semaine en FC"
          keyboardType="decimal-pad" value={revenue} onChangeText={setRevenue} maxLength={18} placeholder="Recettes par semaine (FC)" />
        <Text style={s.text}>Versement en plus par semaine, si vous le souhaitez</Text>
        <TextInput style={s.input} accessibilityLabel="Remboursement volontaire par semaine en FC"
          keyboardType="decimal-pad" value={extra} onChangeText={setExtra} maxLength={18} placeholder="0 FC" />
        {((!!revenue && gross === null) || (!!extra && voluntary === null)) &&
          <Text style={s.error}>Saisissez un montant positif ou zéro, avec au plus une décimale.</Text>}
        {projection && (projection.weeks === null ?
          <Text style={s.text}>Sans remboursement, aucune date de fin ne peut être estimée.</Text> :
          <View style={s.section}>
            <Text style={s.label}>Environ {projection.weeks} semaine{projection.weeks === 1 ? '' : 's'}</Text>
            <Text style={s.text}>{creditMoney(projection.fromTripsMinor)} par semaine via vos trajets
              {voluntary ? ` + ${creditMoney(voluntary)} versés par vous` : ''}.</Text>
            <Text style={s.text}>Dernier versement estimé : {creditMoney(projection.lastMinor)}.</Text>
            <Text style={s.label}>Échéancier indicatif · reste à rembourser</Text>
            {projection.checkpoints.map(point => <View key={point.week} style={s.row}>
              <Text style={[s.text, s.flex]}>Semaine {point.week}</Text><Text style={s.label}>{creditMoney(point.remainingMinor)}</Text>
            </View>)}
          </View>)}
        <Text style={s.text}>Simulation à partir de la remise du bien, ou d’aujourd’hui s’il est déjà remis.
          {' '}Ces estimations ne remplacent pas les échéances minimums du contrat, s’il en prévoit. La durée varie avec vos recettes, les arrondis par trajet et vos versements.
          {' '}En cash, le solde disponible doit permettre le prélèvement. Aucun paiement n’est déclenché ici.</Text>
      </> : <Text style={s.text}>La durée ne peut pas être estimée pour ce contrat : son taux est partagé entre plusieurs crédits ou ses conditions doivent être actualisées.</Text>}
      </>}
    </>}
  </View>;
}
