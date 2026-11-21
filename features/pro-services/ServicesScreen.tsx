import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { ServiceLayout, ServiceButton, s } from '@/features/pro-services/ServiceLayout';
import { ServicesDashboard } from './ServicesDashboard';
import { dashboardStyles as d } from './ServicesDashboard.styles';
import { creditDashboard } from './servicesDashboardModel';
import { statusNames } from './model';
import { useGetProOfferingsQuery, useGetCurrentDocumentCaseQuery } from '@/store/api/proServicesApi';
import { useGetAssetCreditsQuery, useGetAssetCreditQuery } from '@/store/api/assetCreditApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';

export default function ServicesScreen({ embedded = false, bottomOverlay = 0 }: { embedded?: boolean; bottomOverlay?: number } = {}) {
  const active = useScreenIsActive();
  const enabled = useDisplayReadsEnabled(active);
  const user = useAppSelector(selectUser);
  const { fontScale } = useWindowDimensions();
  const [searchOpen, setSearchOpen] = useState(false), [search, setSearch] = useState('');
  useEffect(() => { setSearch(''); setSearchOpen(false); }, [user?.id]);
  const reads = { skip: !enabled, refetchOnMountOrArgChange: 30 };
  const catalogue = useGetProOfferingsQuery(undefined, reads);
  const documents = useGetCurrentDocumentCaseQuery(undefined, reads);
  const credits = useGetAssetCreditsQuery(undefined, reads);
  const items = credits.currentData?.items ?? [];
  const focus = creditDashboard(items).focus;
  const detail = useGetAssetCreditQuery(focus?.id ?? '', { ...reads, skip: !enabled || !focus || focus.status !== 'active' });
  const current = documents.currentData?.request;
  const documentsOpen = catalogue.currentData?.some(item => item.code === 'documents' && item.availability === 'open');
  const documentsEnabled = active && !documents.isFetching && !documents.isError && (!!current || (documentsOpen === true && !catalogue.isError));
  const go = (href: string) => { if (active) router.push(href as Href); };
  const error = catalogue.isError || documents.isError || credits.isError;
  return <ServiceLayout title="Services" embedded={embedded} bottomOverlay={bottomOverlay} compact headerActions={<>
    <TouchableOpacity style={d.headerButton} accessibilityRole="button" accessibilityLabel="Historique de mes dossiers" disabled={!active} onPress={() => go('/services/history')}>
      <Ionicons name="time-outline" size={21} color="#0D2240" />
    </TouchableOpacity>
    <TouchableOpacity style={d.headerButton} accessibilityRole="button" accessibilityLabel="Rechercher un service" accessibilityState={{ expanded: searchOpen }} onPress={() => { setSearchOpen(v => !v); setSearch(''); }}>
      <Ionicons name={searchOpen ? 'close-outline' : 'search-outline'} size={21} color="#0D2240" />
    </TouchableOpacity>
  </>}>
    {searchOpen && <TextInput style={s.input} autoFocus value={search} onChangeText={setSearch} accessibilityLabel="Rechercher un service" placeholder="Téléphone, documents, flotte…" returnKeyType="search" />}
    {(catalogue.isLoading || credits.isLoading) && <ActivityIndicator accessibilityLabel="Chargement des services" color="#C34412" />}
    {error && <View style={s.notice}><Text style={s.error} accessibilityRole="alert">Certaines informations ne sont pas à jour.</Text>
      <ServiceButton title="Recharger les services" secondary disabled={!enabled} busy={catalogue.isFetching || documents.isFetching || credits.isFetching}
        onPress={() => { if (enabled) { void catalogue.refetch(); void documents.refetch(); void credits.refetch(); } }} />
    </View>}
    <ServicesDashboard driver={user?.isDriver === true || user?.role === 'driver'} search={search} enabled={active} stacked={fontScale > 1.3}
      documentStatus={current ? statusNames[current.status] : undefined}
      documentAction={documentsOpen ? 'Préparer mon dossier' : 'Service bientôt disponible'} documentsEnabled={documentsEnabled}
      credits={items} creditDetail={detail.isError ? undefined : detail.currentData} creditsReady={!!credits.currentData && !credits.isError}
      onDocuments={() => { if (documentsEnabled) go(current ? current.canEdit ? `/services/edit?id=${current.id}` : `/services/${current.id}` : '/services/new?service=documents'); }}
      onCredits={() => go('/services/credit/repayments')} onBuy={() => go('/services/catalogue')} onFleet={() => go('/services/fleet')}
      onCredit={id => go(`/services/credit/${id}`)} />
  </ServiceLayout>;
}
