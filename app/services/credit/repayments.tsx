import { router, type Href } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { ServiceButton, ServiceLayout, s } from '@/features/pro-services/ServiceLayout';
import { creditEquipmentLabel, creditMoney, creditStatus } from '@/features/pro-services/assetCreditModel';
import { type AssetCredit, useGetAssetCreditsQuery } from '@/store/api/assetCreditApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled, useDisplayRefetch } from '@/hooks/useDisplayReads';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';

const openStatuses = new Set<AssetCredit['status']>(['active', 'accepted', 'offered']);
const order = { active: 0, accepted: 1, offered: 2, settled: 3, declined: 4, cancelled: 5 };

export default function RepaymentsScreen() {
  const user = useAppSelector(selectUser);
  const active = useScreenIsActive();
  const enabled = useDisplayReadsEnabled(active && Boolean(user?.id));
  const query = useGetAssetCreditsQuery(undefined, displayReadOptions(enabled));
  const refresh = useDisplayRefetch(enabled, user?.id ?? '', query.refetch);
  const [history, setHistory] = useState(false);
  const items = user?.id ? query.currentData?.items : undefined;
  const current = items?.filter(item => openStatuses.has(item.status)).sort((a, b) => order[a.status] - order[b.status]) ?? [];
  const closed = items?.filter(item => !openStatuses.has(item.status)) ?? [];
  const rows = (credits: AssetCredit[]) => credits.map(item => <TouchableOpacity key={item.id}
    accessibilityRole="button" testID={`credit-repayment-${item.id}`} style={s.section}
    onPress={() => router.push(('/services/credit/' + encodeURIComponent(item.id)) as Href)}>
    <Text style={s.badge}>{creditEquipmentLabel(item.assetKind)} · {creditStatus[item.status]}</Text>
    <Text style={s.label}>{item.label}</Text>
    {!['declined', 'cancelled'].includes(item.status) && <Text style={s.text}>
      {item.status === 'offered' ? 'Montant proposé' : 'Reste à rembourser'} : {creditMoney(Number(item.principalMinor) - Number(item.paidMinor))}
    </Text>}
    <Text style={s.eyebrow}>{item.status === 'active' ? 'Gérer mon remboursement' : item.status === 'offered' ? 'Voir mon offre' : 'Voir le détail'} →</Text>
  </TouchableOpacity>);
  return <ServiceLayout title="Mes remboursements">
    <ServiceButton title="Mes achats et nouveaux contrats" secondary onPress={() => router.push('/services/purchases' as Href)} />
    <Text style={s.text}>Choisissez un crédit pour voir son solde, son historique ou rembourser un montant.</Text>
    {(query.isLoading || query.isFetching) && <ActivityIndicator accessibilityLabel="Actualisation des remboursements" />}
    {!enabled && active && user?.id && <Text accessibilityRole="alert" style={s.text}>Connectez-vous à Internet pour actualiser vos remboursements.</Text>}
    {query.isError && <View style={s.notice}>
      <Text accessibilityRole="alert" style={s.error}>Impossible d’actualiser vos crédits. Les derniers montants affichés peuvent avoir changé.</Text>
      <ServiceButton title="Réessayer" secondary disabled={!enabled} busy={query.isFetching}
        onPress={() => { void refresh(); }} />
    </View>}
    {rows(current)}
    {items && !current.length && !query.isError && !query.isFetching && enabled && <Text style={s.label}>Aucun crédit en cours</Text>}
    {!!closed.length && <>
      <ServiceButton title={history ? 'Masquer les anciens crédits' : 'Voir les anciens crédits'} secondary onPress={() => setHistory(value => !value)} />
      {history && rows(closed)}
    </>}
    <ServiceButton title="Choisir un équipement ou un véhicule" secondary onPress={() => router.push('/services/credit')} />
  </ServiceLayout>;
}
