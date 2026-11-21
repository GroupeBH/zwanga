import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';
import { ServiceLayout, ServiceButton, s } from '@/features/pro-services/ServiceLayout';
import { proError } from '@/features/pro-services/model';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useGetFleetDirectoryQuery, useGetMyFleetApplicationsQuery, useApplyToFleetMutation, useWithdrawFleetApplicationMutation, type FleetApplicationStatus } from '@/store/api/fleetApplicationsApi';

const labels: Record<FleetApplicationStatus, string> = { PENDING: 'En attente', ACCEPTED: 'Acceptée', REJECTED: 'Refusée', WITHDRAWN: 'Retirée' };
export default function FleetApplicationsScreen() {
  const active = useScreenIsActive();
  const [page, setPage] = useState(1), [minePage, setMinePage] = useState(1);
  const [search, setSearch] = useState(''), [query, setQuery] = useState('');
  const [fleet, setFleet] = useState<{ id: string; displayName: string } | null>(null);
  const [message, setMessage] = useState(''), [notice, setNotice] = useState('');
  const directory = useGetFleetDirectoryQuery({ page, search: query }, { skip: !active, refetchOnMountOrArgChange: true });
  const mine = useGetMyFleetApplicationsQuery({ page: minePage }, { skip: !active, refetchOnMountOrArgChange: true });
  const [apply, applying] = useApplyToFleetMutation();
  const [withdraw, withdrawing] = useWithdrawFleetApplicationMutation();
  const lock = useRef(false);
  const activeRef = useRef(active); activeRef.current = active;
  const busy = applying.isLoading || withdrawing.isLoading;
  async function run(action: () => Promise<unknown>, success: string) {
    if (!activeRef.current || lock.current) return;
    lock.current = true; setNotice('');
    try { await action(); setNotice(success); }
    catch (e) { setNotice(proError(e)); }
    finally { lock.current = false; }
  }
  return <ServiceLayout title="Rejoindre une flotte">
    <Text style={s.text}>Choisissez une flotte et présentez-vous. Vos nom et numéro seront transmis à ses responsables.</Text>
    {!!notice && <Text accessibilityRole="alert" style={s.text}>{notice}</Text>}
    {(directory.isError || mine.isError) && <View style={s.notice}>
      <Text style={s.error}>{proError(directory.error ?? mine.error)}</Text>
      <ServiceButton title="Réessayer" secondary disabled={!active} onPress={() => { directory.refetch(); mine.refetch(); }} />
    </View>}
    <Text style={s.title}>Mes candidatures</Text>
    {mine.isFetching && <ActivityIndicator accessibilityLabel="Chargement des candidatures" />}
    {mine.currentData?.items.length === 0 && <Text style={s.text}>Aucune candidature pour le moment.</Text>}
    {mine.currentData?.items.map(a => <View key={a.id} style={s.section}>
      <Text style={s.label}>{a.organizationName}</Text><Text style={s.badge}>{labels[a.status]}</Text>
      <Text style={s.text}>{a.message}</Text>
      {!!a.decisionNote && <Text style={s.text}>{a.decisionNote}</Text>}
      {a.status === 'ACCEPTED' && <Text style={s.text}>La flotte a retenu votre candidature. Avant de conduire, votre profil et le véhicule devront être vérifiés. Vous devrez ensuite accepter les conditions proposées.</Text>}
      {a.status === 'PENDING' && <ServiceButton title="Retirer ma candidature" secondary disabled={busy || !active} onPress={() => Alert.alert('Retirer la candidature ?', a.organizationName, [
        { text: 'Garder', style: 'cancel' },
        { text: 'Retirer', style: 'destructive', onPress: () => run(() => withdraw({ id: a.id }).unwrap(), 'Candidature retirée.') },
      ])} />}
    </View>)}
    {minePage > 1 && <ServiceButton title="Candidatures précédentes" secondary disabled={mine.isFetching || !active} onPress={() => setMinePage(minePage - 1)} />}
    {!!mine.currentData && minePage * mine.currentData.limit < mine.currentData.total && <ServiceButton title="Candidatures suivantes" secondary disabled={mine.isFetching || !active} onPress={() => setMinePage(minePage + 1)} />}
    <Text style={s.title}>Trouver une flotte</Text>
    <TextInput style={s.input} value={search} onChangeText={setSearch} maxLength={100} placeholder="Nom de la flotte" accessibilityLabel="Rechercher une flotte" />
    <ServiceButton title="Rechercher" secondary disabled={!active || directory.isFetching || busy} onPress={() => { setQuery(search.trim()); setPage(1); setFleet(null); }} />
    {directory.isFetching && <ActivityIndicator accessibilityLabel="Chargement des flottes" />}
    {directory.currentData?.items.length === 0 && <Text style={s.text}>Aucune flotte disponible pour cette recherche.</Text>}
    {directory.currentData?.items.map(o => <View key={o.id} style={s.section}>
      <Text style={s.label}>{o.displayName}</Text>
      <ServiceButton title={fleet?.id === o.id ? 'Fermer' : 'Postuler'} secondary disabled={busy || !active} onPress={() => { setFleet(fleet?.id === o.id ? null : o); setMessage(''); setNotice(''); }} />
      {fleet?.id === o.id && <>
        <TextInput style={s.input} multiline value={message} onChangeText={setMessage} maxLength={2000} placeholder="Votre expérience et vos disponibilités" accessibilityLabel="Message de candidature" />
        <Text style={s.text}>10 caractères minimum. Aucun paiement ni engagement automatique.</Text>
        <ServiceButton title="Envoyer ma candidature" busy={busy} disabled={!active || message.trim().length < 10} onPress={() => run(async () => {
          const result = await apply({ organizationId: o.id, message: message.trim() }).unwrap();
          setFleet(null); setMessage(''); setMinePage(1);
          return result;
        }, 'Candidature enregistrée. Consultez son statut dans Mes candidatures.')} />
      </>}
    </View>)}
    {page > 1 && <ServiceButton title="Flottes précédentes" secondary disabled={directory.isFetching || busy || !active} onPress={() => { setPage(page - 1); setFleet(null); }} />}
    {!!directory.currentData && page * directory.currentData.limit < directory.currentData.total && <ServiceButton title="Flottes suivantes" secondary disabled={directory.isFetching || busy || !active} onPress={() => { setPage(page + 1); setFleet(null); }} />}
  </ServiceLayout>;
}
