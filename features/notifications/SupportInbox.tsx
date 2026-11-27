import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useGetMySupportTicketsQuery } from '@/store/api/supportApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { TICKET_STATUS_META, formatSupportDate } from '@/components/support/supportData';
import { inboxStyles as s } from './inboxStyles';

const PAGE_SIZE = 10;

export function SupportInbox() {
  const router = useRouter();
  const active = useScreenIsActive();
  const [page, setPage] = useState(1);
  const { currentData: data, isFetching, isError, refetch } = useGetMySupportTicketsQuery({ page, limit: PAGE_SIZE }, {
    skip: !active, refetchOnMountOrArgChange: 30, refetchOnReconnect: true,
  });
  const refresh = () => { if (active && !isFetching) void refetch(); };
  const hasNext = Boolean(data && page * PAGE_SIZE < data.meta.total);
  return <FlatList data={data?.data ?? []} keyExtractor={item => item.id} contentContainerStyle={s.content}
    refreshing={isFetching} onRefresh={refresh} initialNumToRender={10}
    ListHeaderComponent={<>
      <TouchableOpacity style={s.helpLink} accessibilityRole="button" onPress={() => { if (active) router.push('/support'); }}>
        <View style={s.helpIcon}><Ionicons name="headset-outline" size={24} color="#AE3907" /></View>
        <View style={s.copy}><Text style={s.heading}>Comment vous aider ?</Text><Text style={s.muted}>Contacter Zwanga ou consulter l’aide</Text></View>
        <Ionicons name="chevron-forward" size={20} color="#626B78" />
      </TouchableOpacity>
      <Text style={s.heading}>Vos dossiers</Text>
      {isError && data && <TouchableOpacity accessibilityRole="button" style={s.action} onPress={refresh}>
        <Text style={s.muted}>Mise à jour impossible. Réessayer</Text>
      </TouchableOpacity>}
    </>}
    renderItem={({ item }) => <View style={s.ticket}>
      <Text style={s.ticketStatus}>{TICKET_STATUS_META[item.status]?.label ?? 'En cours'}</Text>
      <Text style={s.ticketTitle}>{item.subject}</Text>
      <Text style={s.muted}>Mis à jour {formatSupportDate(item.updatedAt)}</Text>
      {item.resolutionSummary ? <Text style={s.muted}>{item.resolutionSummary}</Text> : null}
    </View>}
    ListEmptyComponent={<View style={s.empty}>
      {isFetching ? <ActivityIndicator color="#AE3907" /> : <>
        <Ionicons name="chatbox-ellipses-outline" size={32} color="#626B78" />
        <Text style={[s.ticketTitle, s.centered]}>{isError ? 'Assistance indisponible' : page > 1 ? 'Aucun dossier sur cette page' : 'Aucun dossier en cours'}</Text>
        <Text style={[s.muted, s.centered]}>{isError ? 'Vos dossiers n’ont pas pu être chargés.' : 'Retrouvez ici le suivi de vos échanges avec Zwanga.'}</Text>
        {isError && <TouchableOpacity accessibilityRole="button" style={s.action} onPress={refresh}><Text style={s.actionText}>Réessayer</Text></TouchableOpacity>}
      </>}
    </View>}
    ListFooterComponent={<View style={s.paging}>
      {page > 1 && <TouchableOpacity accessibilityRole="button" disabled={!active || isFetching} style={s.action}
        onPress={() => { if (active && !isFetching) setPage(value => Math.max(1, value - 1)); }}><Text style={s.actionText}>Précédent</Text></TouchableOpacity>}
      {(page > 1 || hasNext) && <Text style={s.muted}>Page {page}</Text>}
      {hasNext && <TouchableOpacity accessibilityRole="button" disabled={!active || isFetching} style={s.action}
        onPress={() => { if (active && !isFetching && hasNext) setPage(value => value + 1); }}><Text style={s.actionText}>Suivant</Text></TouchableOpacity>}
    </View>}
  />;
}
