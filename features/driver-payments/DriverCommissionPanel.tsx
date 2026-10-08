import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/styles';
import { useDriverFinanceSummaryQuery } from '@/store/api/driverFinanceApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';

export function DriverCommissionPanel({ userId, onRecharge }: { userId: string; onRecharge?: () => void }) {
  const router = useRouter();
  const active = useScreenIsActive();
  const [expanded, setExpanded] = useState(false);
  const { currentData: data, isFetching, error, refetch } = useDriverFinanceSummaryQuery(userId, { skip: !active, refetchOnMountOrArgChange: true });
  const ready = Boolean(data && !error);
  const proEnd = data?.pro.endDate ? new Date(data.pro.endDate) : null;
  return <View style={s.panel}>
    <View style={s.heading}>
      <Text style={s.title}>Réserve cash</Text>
      {ready && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Détails de la réserve cash"
        accessibilityState={{ expanded }} onPress={() => setExpanded(current => !current)} style={s.detailsButton} activeOpacity={0.7}>
        <Text style={s.detailsLabel}>{expanded ? 'Réduire' : 'Détails'}</Text>
        <Text style={s.detailsLabel} accessible={false}>{expanded ? '−' : '+'}</Text>
      </TouchableOpacity>}
    </View>
    {data && !error ? <>
      <View style={s.balanceRow}>
        <Text style={s.value}>{data.cash.availableTokens.toLocaleString('fr-FR')} jetons</Text>
        <Text style={s.copy}>disponibles</Text>
      </View>
      <Text style={s.status} accessibilityLiveRegion="polite">
        {data.cash.enabled ? 'Paiements cash disponibles' : 'Nouvelles courses cash indisponibles'}
      </Text>
      {data.cash.reservedTokens > 0 && <Text style={s.copy}>{data.cash.reservedTokens.toLocaleString('fr-FR')} jetons réservés aux courses confirmées.</Text>}
      {data.cash.debtTokens > 0 && <Text style={s.warning}>
        À régulariser : {data.cash.debtTokens.toLocaleString('fr-FR')} jetons, déduits de votre prochaine recharge.
      </Text>}
      {expanded && <View style={s.details}>
        <Text style={s.copy}>Réserve pour la commission de {Number((data.commissionRate * 100).toFixed(2))} % sur le cash. Seuls les jetons achetés l’alimentent, pas les bonus.</Text>
        <Text style={s.copy}>Couvre environ {data.cash.coverageAmount.toLocaleString('fr-FR')} FC de paiements cash.</Text>
        {data.cash.reservedTokens === 0 && <Text style={s.copy}>Aucun jeton réservé pour des courses confirmées.</Text>}
        {!data.cash.enabled && <Text style={s.copy}>Vous pouvez terminer les courses déjà confirmées.</Text>}
        <View style={s.proDetails}>
          <Text style={s.detailsLabel}>{data.pro.isActive
            ? proEnd && Number.isFinite(proEnd.getTime()) ? `Pro actif jusqu’au ${proEnd.toLocaleDateString('fr-FR')}` : 'Pro actif'
            : data.trial ? 'Pro inactif · offre gratuite' : 'Essai Pro après votre premier trajet terminé'}</Text>
          <Text style={s.copy}>Pro : {data.proPrice.toLocaleString('fr-FR')} {data.currency} / {data.durationDays} jours. L’abonnement ne recharge pas la réserve et ne supprime pas la commission, même pendant l’essai.</Text>
        </View>
      </View>}
    </> : <TouchableOpacity onPress={() => { void refetch(); }} accessibilityRole="button"
      disabled={isFetching} accessibilityState={{ disabled: isFetching, busy: isFetching }} style={s.retryButton}>
      <Text style={s.copy}>{isFetching ? 'Vérification de votre réserve…' : 'Réserve indisponible · Réessayer'}</Text>
    </TouchableOpacity>}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Recharger les jetons pour la réserve cash"
      onPress={onRecharge ?? (() => router.push('/wallet'))} style={s.button} activeOpacity={0.8}>
      <Text style={s.buttonText}>Recharger</Text>
    </TouchableOpacity>
  </View>;
}
const s = StyleSheet.create({
  panel: { padding: 16, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[200], gap: 6 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: Colors.gray[900], fontSize: 16, fontWeight: '700', flexShrink: 1 },
  detailsButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  detailsLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray[700] },
  balanceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' },
  value: { color: Colors.gray[900], fontSize: 23, fontWeight: '700' },
  copy: { color: Colors.gray[600], fontSize: 13, lineHeight: 19 },
  status: { color: Colors.gray[800], fontSize: 13, lineHeight: 19 },
  warning: { color: Colors.primaryDark, fontSize: 13, lineHeight: 19 },
  details: { gap: 8, paddingTop: 10, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.gray[200] },
  proDetails: { gap: 4, paddingTop: 4 },
  retryButton: { minHeight: 44, justifyContent: 'center' },
  button: { minHeight: 44, marginTop: 8, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.primary },
  buttonText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
