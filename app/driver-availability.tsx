import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/styles';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useDriverDispatchStatusQuery } from '@/store/api/driverDispatchApi';
import { NearbyDriverLocationPermission } from '@/components/profile/NearbyDriverLocationPermission';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';

export default function DriverAvailabilityScreen() {
  const router = useRouter();
  const active = useScreenIsActive();
  const enabled = useDisplayReadsEnabled(active);
  const [expanded, setExpanded] = useState(false);
  const { data, isError, isLoading, isFetching, refetch } = useDriverDispatchStatusQuery(undefined, displayReadOptions(enabled));
  const available = Boolean(data?.enabled && data.automatic && !isError);
  return <SafeAreaView style={styles.screen}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retour" style={styles.back} onPress={() => router.back()}>
      <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
    </TouchableOpacity>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Alertes conducteur</Text>
      <Text style={styles.copy}>Vos réservations et les demandes proches vous sont proposées automatiquement.</Text>
      {isLoading ? <ActivityIndicator color={Colors.primary} /> : isError
        ? <TouchableOpacity accessibilityRole="button" disabled={!enabled || isFetching}
          onPress={() => { if (enabled && !isFetching) void refetch(); }}>
          <Text style={styles.copy}>{isFetching ? 'Vérification…' : 'Service indisponible · Réessayer'}</Text>
        </TouchableOpacity>
        : <Text style={styles.hint}>{available ? 'Demandes proches : service disponible' : 'Demandes proches : service indisponible'}</Text>}
      <NearbyDriverLocationPermission available={available} />
      <Text style={styles.label}>Son des notifications</Text>
      <Text style={styles.copy}>Une sonnerie jusqu’à 30 secondes, arrêtée à l’ouverture de Zwanga.</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => { void Linking.openSettings().catch(() => {}); }}>
        <Text style={styles.buttonText}>Ouvrir les réglages du téléphone</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} style={styles.more}
        onPress={() => setExpanded(value => !value)}>
        <Text style={styles.hint}>{expanded ? 'Masquer les détails' : 'En savoir plus'}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.gray[600]} />
      </TouchableOpacity>
      {expanded && <>
        <Text style={styles.copy}>Aucune disponibilité à activer. Les demandes sont proposées au conducteur éligible le plus proche avec un véhicule adapté. Acceptez ou refusez depuis la notification.</Text>
        <Text style={styles.copy}>Une position trop ancienne n’est plus utilisée : elle reste valable au maximum {Math.round((data?.positionFreshSeconds ?? 300) / 60)} minute(s). Un arrêt forcé de l’app peut interrompre la localisation.</Text>
        <Text style={styles.copy}>Le mode silencieux, « Ne pas déranger » et les restrictions du téléphone peuvent limiter les alertes.</Text>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.white }, back: { padding: 16, alignSelf: 'flex-start' },
  content: { padding: 24, gap: 20 }, title: { fontSize: 24, fontWeight: '700', color: Colors.gray[900] },
  label: { fontSize: 17, fontWeight: '600', color: Colors.gray[900] },
  copy: { fontSize: 15, lineHeight: 22, color: Colors.gray[700] }, hint: { fontSize: 13, lineHeight: 19, color: Colors.gray[600] },
  button: { padding: 16, borderRadius: 14, backgroundColor: Colors.primary },
  buttonText: { textAlign: 'center', fontSize: 15, fontWeight: '700', color: Colors.white },
  more: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
