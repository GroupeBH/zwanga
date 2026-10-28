import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RideModal } from '@/features/navigation/RideModal';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useRequestDriverChoicesQuery, type SelectedRequestDriver } from '@/store/api/requestDriverApi';
import type { TripRequestVehicleType } from '@/types';

type Props = {
  departure: { latitude: number; longitude: number } | null;
  vehicleType: TripRequestVehicleType; seats: number; disabled?: boolean;
  selected: SelectedRequestDriver | null; onSelect: (driver: SelectedRequestDriver | null) => void;
};

export function RequestDriverPicker({ departure, vehicleType, seats, selected, onSelect, disabled }: Props) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<'nearby' | 'search'>('nearby');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const active = useScreenIsActive();
  const insets = useSafeAreaInsets();
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 350); return () => clearTimeout(timer); }, [search]);
  const ready = mode === 'nearby' || (debounced.length >= 2 && debounced === search.trim());
  const enabled = useDisplayReadsEnabled(active && visible && !!departure && ready);
  const query = useRequestDriverChoicesQuery({ latitude: departure?.latitude ?? 0, longitude: departure?.longitude ?? 0,
    vehicleType, seats, ...(mode === 'search' ? { search: debounced } : {}) }, displayReadOptions(enabled));
  const choose = (driver: SelectedRequestDriver | null) => { onSelect(driver); setVisible(false); };
  return <>
    <Pressable style={s.selector} onPress={() => setVisible(true)} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={selected ? `Conducteur choisi : ${selected.name}. Modifier` : 'Choisir un conducteur, facultatif'}>
      <View style={s.icon}><Ionicons name="person-outline" size={21} color="#CE4613" /></View>
      <View style={s.grow}><Text style={s.name}>{selected?.name || 'Choisir un conducteur'}</Text>
        <Text style={s.caption}>{selected ? 'La demande sera envoyée uniquement à ce conducteur.' : 'Facultatif · Sinon, les conducteurs proches seront prévenus.'}</Text>
        {selected && selected.vehicleType !== vehicleType && <Text style={s.error}>Le véhicule a changé. Choisissez à nouveau.</Text>}
      </View>
      <Ionicons name="chevron-forward" size={19} color="#667085" />
    </Pressable>
    <RideModal inApp visible={visible && active} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setVisible(false)} accessibilityLabel="Fermer" accessibilityRole="button" />
        <View style={[s.panel, { paddingBottom: Math.max(insets.bottom, 16), marginTop: insets.top + 16 }]}>
          <View style={s.heading}><Text style={s.title}>À qui envoyer la demande ?</Text>
            <Pressable style={s.close} onPress={() => setVisible(false)} accessibilityRole="button" accessibilityLabel="Fermer le choix du conducteur">
              <Ionicons name="close" size={24} color="#172033" />
            </Pressable>
          </View>
          <Pressable style={[s.defaultChoice, !selected && s.selected]} onPress={() => choose(null)} accessibilityRole="button">
            <Ionicons name="people-outline" size={22} color="#CE4613" />
            <View style={s.grow}><Text style={s.name}>Les conducteurs proches</Text><Text style={s.caption}>Laisser Zwanga trouver un conducteur</Text></View>
            {!selected && <Ionicons name="checkmark-circle" size={22} color="#CE4613" />}
          </Pressable>
          <View style={s.tabs}>{(['nearby', 'search'] as const).map(tab => <Pressable key={tab} onPress={() => setMode(tab)}
            accessibilityRole="tab" accessibilityState={{ selected: mode === tab }} style={[s.tab, mode === tab && s.activeTab]}>
            <Text style={[s.tabText, mode === tab && s.activeText]}>{tab === 'nearby' ? 'Autour du départ' : 'Rechercher'}</Text>
          </Pressable>)}</View>
          {mode === 'search' && <View style={s.search}>
            <Ionicons name="search" size={20} color="#667085" />
            <TextInput style={s.input} value={search} onChangeText={setSearch} placeholder="Nom ou identifiant Zwanga"
              placeholderTextColor="#667085" accessibilityLabel="Nom ou identifiant du conducteur" maxLength={80} autoCorrect={false} returnKeyType="search" />
          </View>}
          <Text style={s.caption}>Le conducteur choisi devra accepter votre demande.</Text>
          {query.isFetching && enabled ? <ActivityIndicator style={s.loader} color="#CE4613" accessibilityLabel="Recherche des conducteurs" /> : null}
          <FlatList style={s.list} keyboardShouldPersistTaps="handled" data={enabled && !query.isError && !query.isFetching ? query.currentData ?? [] : []}
            keyExtractor={driver => driver.id} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={3}
            renderItem={({ item }) => <Pressable style={[s.driver, selected?.id === item.id && s.selected]} accessibilityRole="button"
              accessibilityLabel={`Choisir ${item.name}, ${item.vehicle}`} onPress={() => choose({ ...item, vehicleType })}>
              <View style={s.avatar}><Text style={s.initial}>{item.name.trim().charAt(0).toLocaleUpperCase() || 'C'}</Text></View>
              <View style={s.grow}><Text style={s.name}>{item.name}</Text><Text style={s.caption}>{item.vehicle}</Text>
                {Number.isFinite(Number(item.distanceKm)) && <Text style={s.caption}>À environ {Number(item.distanceKm).toLocaleString('fr-FR')} km du départ</Text>}
              </View><Ionicons name={selected?.id === item.id ? 'checkmark-circle' : 'chevron-forward'} size={22} color="#CE4613" />
            </Pressable>}
            ListEmptyComponent={!query.isFetching || !enabled ? <Text style={s.empty}>{!departure ? 'Choisissez d’abord le point de départ.'
              : !ready ? 'Saisissez au moins 2 caractères pour retrouver un conducteur.'
                : !enabled ? 'Connectez-vous à Internet pour voir les conducteurs.'
                  : query.isError ? 'Les conducteurs ne sont pas disponibles pour le moment. Réessayez.'
                    : mode === 'search' ? 'Aucun conducteur disponible avec ce nom pour ce véhicule. Essayez un autre nom.' : 'Aucun conducteur disponible autour du départ pour ce véhicule.'}</Text> : null}
          />
          {enabled && query.isError && <Pressable style={s.retry} accessibilityRole="button" onPress={() => { void query.refetch(); }}><Text style={s.activeText}>Réessayer</Text></Pressable>}
        </View>
      </KeyboardAvoidingView>
    </RideModal>
  </>;
}

const s = StyleSheet.create({
  grow: { flex: 1 }, selector: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderTopWidth: 1, borderColor: '#E5E7EB' },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF2E9', alignItems: 'center', justifyContent: 'center' },
  name: { color: '#172033', fontSize: 15, fontWeight: '600' }, caption: { color: '#667085', fontSize: 13, lineHeight: 19, marginTop: 3 },
  error: { color: '#B42318', marginTop: 6, fontSize: 13 }, overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#17203380' },
  panel: { height: '78%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { flex: 1, fontSize: 21, fontWeight: '700', color: '#172033' },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  defaultChoice: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16 },
  selected: { backgroundColor: '#FFF6F0', borderColor: '#CE4613' }, tabs: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 9 }, activeTab: { backgroundColor: '#FFFFFF' },
  tabText: { color: '#667085', fontWeight: '600', fontSize: 14 }, activeText: { color: '#B83D0D', fontWeight: '600' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 12, paddingHorizontal: 12 },
  input: { flex: 1, color: '#172033', minHeight: 48, fontSize: 15 }, list: { flex: 1 },
  driver: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 12, marginBottom: 6 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EEF2F6', alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#1E2A4A', fontWeight: '700', fontSize: 18 }, empty: { fontSize: 14, color: '#667085', lineHeight: 21, paddingVertical: 20 },
  retry: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, loader: { marginVertical: 12 },
});
