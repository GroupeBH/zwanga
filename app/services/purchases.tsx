import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ServiceLayout, ServiceButton, s } from '@/features/pro-services/ServiceLayout';
import { commerceMoney, commerceStatus } from '@/features/pro-services/commerceModel';
import { useCommerceContractsQuery, useCommerceApplicationsQuery } from '@/store/api/commerceApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
export default function Purchases() {
  const enabled = useDisplayReadsEnabled(useScreenIsActive()), [after, setAfter] = useState<string>(), [applicationsAfter, setApplicationsAfter] = useState<string>();
  const contracts = useCommerceContractsQuery(after, displayReadOptions(enabled));
  const applications = useCommerceApplicationsQuery(applicationsAfter, displayReadOptions(enabled));
  return <ServiceLayout title="Mes achats et paiements" compact>
    {(contracts.isError || applications.isError) && <View style={s.notice}><Text style={s.error}>Impossible d’actualiser les dossiers.</Text><ServiceButton title="Réessayer" secondary disabled={!enabled} onPress={() => { void contracts.refetch(); void applications.refetch(); }} /></View>}
    {contracts.currentData?.items.map(c => <TouchableOpacity key={c.id} style={s.section} accessibilityRole="button" onPress={() => router.push((`/services/purchases/${c.id}`) as Href)}>
      <Text style={s.badge}>{commerceStatus[c.status] ?? c.status}</Text><Text style={s.label}>{c.label}</Text>
      <Text style={s.text}>{commerceMoney((BigInt(c.principalMinor) - BigInt(c.paidMinor) + BigInt(c.depositMinor ?? '0') - BigInt(c.depositPaidMinor ?? '0')).toString())} à régler · Voir le détail →</Text>
    </TouchableOpacity>)}
    {contracts.currentData?.items.length === 0 && <Text style={s.text}>Aucun contrat pour le moment. Les dossiers ci-dessous attendent leur examen.</Text>}
    {!!contracts.currentData?.nextCursor && <ServiceButton title="Contrats suivants" secondary onPress={() => setAfter(contracts.currentData?.nextCursor ?? undefined)} />}
    {!!after && <ServiceButton title="Premiers contrats" secondary onPress={() => setAfter(undefined)} />}
    {applications.currentData?.items.filter(a => a.status === 'submitted').map(a => <View key={a.id} style={s.notice}><Text style={s.label}>Dossier en cours d’examen</Text><Text style={s.text}>{a.notes || 'Votre choix a bien été reçu. Le contrat apparaîtra ici après validation.'}</Text></View>)}
    {!!applications.currentData?.nextCursor && <ServiceButton title="Dossiers suivants" secondary onPress={() => setApplicationsAfter(applications.currentData?.nextCursor ?? undefined)} />}
    <ServiceButton title="Voir le catalogue" secondary onPress={() => router.push('/services/catalogue' as Href)} />
    <ServiceButton title="Mes crédits précédents" secondary onPress={() => router.push('/services/credit/repayments')} />
  </ServiceLayout>;
}
