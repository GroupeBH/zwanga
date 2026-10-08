import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TripPaymentMode } from '@/types';
import { Colors } from '@/constants/styles';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { useDriverFinanceSummaryQuery } from '@/store/api/driverFinanceApi';

export const paymentModeLabels: Record<TripPaymentMode, string> = { electronic: 'Paiement électronique', points: 'Jetons Zwanga', cash: 'Espèces (cash)' };
const shortLabels: Record<TripPaymentMode, string> = { electronic: 'Électronique', points: 'Jetons', cash: 'Cash' };

export function PublishPaymentModes({ value, onChange, price }: {
  value: TripPaymentMode[]; onChange: React.Dispatch<React.SetStateAction<TripPaymentMode[]>>; price: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const user = useAppSelector(selectUser), router = useRouter();
  const { currentData: finance, isFetching, isError, refetch } = useDriverFinanceSummaryQuery(user?.id ?? '', { skip: !user?.id, refetchOnMountOrArgChange: true });
  const required = finance ? Math.round(Math.max(0, price) * 0.05 / finance.cash.moneyPerToken * 100) / 100 : Infinity;
  const cashAvailable = Boolean(!isError && finance?.cash.enabled && finance.cash.availableTokens >= required);
  const canRefresh = Boolean(user?.id && !isFetching);
  return <View style={s.panel}>
    <View style={s.heading}>
      <Text style={s.title}>Paiements acceptés</Text>
      <Text style={s.commission}>Commission 5 %</Text>
    </View>
    <View style={s.options}>
      {(Object.keys(paymentModeLabels) as TripPaymentMode[]).map(mode => {
        const selected = value.includes(mode), disabled = mode === 'cash' && !cashAvailable && !selected;
        return <TouchableOpacity key={mode} accessibilityRole="checkbox"
          accessibilityLabel={paymentModeLabels[mode]} accessibilityState={{ checked: selected, disabled }}
          disabled={disabled} style={[s.option, selected && s.selected, disabled && s.disabled]} activeOpacity={0.7}
          onPress={() => onChange(previous => previous.includes(mode) ? previous.length > 1 ? previous.filter(item => item !== mode) : previous : [...previous, mode])}>
          <Text style={[s.check, selected && s.selectedText]} accessible={false}>{selected ? '✓' : '○'}</Text>
          <Text style={[s.label, selected && s.selectedText]}>{shortLabels[mode]}</Text>
        </TouchableOpacity>;
      })}
    </View>
    {!cashAvailable && <View>
      <Text style={s.copy} accessibilityLiveRegion="polite">
        {isFetching ? 'Vérification du cash…' : isError || !finance
          ? 'Cash : vérification indisponible.'
          : 'Cash : rechargez vos jetons pour l’activer.'}
      </Text>
      <View style={s.actions}>
        {!isFetching && !isError && finance && <TouchableOpacity accessibilityRole="button" style={s.action}
          onPress={() => router.push('/wallet')}><Text style={s.link}>Recharger</Text></TouchableOpacity>}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Actualiser la disponibilité du cash"
          accessibilityState={{ disabled: !canRefresh }} disabled={!canRefresh}
          style={[s.action, !canRefresh && s.disabled]} onPress={() => { void refetch(); }}>
          <Text style={s.link}>{isFetching ? 'Vérification…' : 'Actualiser'}</Text>
        </TouchableOpacity>
      </View>
    </View>}
    {cashAvailable && value.includes('cash') && <Text style={s.copy}>Cash : commission réservée sur vos jetons achetés.</Text>}
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} style={s.detailsButton}
      onPress={() => setExpanded(current => !current)} activeOpacity={0.7}>
      <Text style={s.detailsLabel}>Frais et conditions</Text><Text style={s.detailsLabel} accessible={false}>{expanded ? '−' : '+'}</Text>
    </TouchableOpacity>
    {expanded && <View style={s.details}>
      <Text style={s.copy}>Le passager choisit parmi vos modes activés. Gardez au moins un mode.</Text>
      <Text style={s.copy}>Électronique et jetons : les 5 % sont retenus sur le paiement, sans débiter votre portefeuille.</Text>
      <Text style={s.copy}>Cash : les 5 % sont réservés sur vos jetons achetés à l’acceptation. La réserve est revérifiée pour chaque réservation.</Text>
      {cashAvailable && <View style={s.actions}>
        <TouchableOpacity accessibilityRole="button" style={s.action} onPress={() => router.push('/wallet')}>
          <Text style={s.link}>Recharger les jetons</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={s.action} disabled={!canRefresh}
          accessibilityState={{ disabled: !canRefresh }} onPress={() => { void refetch(); }}>
          <Text style={s.link}>Actualiser</Text>
        </TouchableOpacity>
      </View>}
    </View>}
  </View>;
}
const s = StyleSheet.create({
  panel: { gap: 8, paddingVertical: 12 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.gray[900] },
  commission: { fontSize: 12, color: Colors.gray[600] },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { flex: 1, minWidth: 80, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 2,
    borderWidth: 1, borderColor: Colors.gray[300], borderRadius: 12, paddingVertical: 8, paddingHorizontal: 4 },
  selected: { borderColor: Colors.primary, backgroundColor: '#FFF3EC' },
  disabled: { opacity: 0.5 }, check: { fontSize: 16, color: Colors.gray[600] },
  label: { fontSize: 13, textAlign: 'center', fontWeight: '600', color: Colors.gray[800] },
  selectedText: { color: Colors.primaryDark },
  copy: { fontSize: 12, lineHeight: 18, color: Colors.gray[600] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  action: { minHeight: 44, justifyContent: 'center' },
  link: { color: Colors.primaryDark, fontWeight: '600', fontSize: 13 },
  detailsButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  detailsLabel: { color: Colors.gray[700], fontSize: 13, fontWeight: '600' },
  details: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.gray[200], paddingTop: 8 },
});
