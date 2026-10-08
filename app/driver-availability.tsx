import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/styles';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useDriverDispatchStatusQuery } from '@/store/api/driverDispatchApi';

export default function DriverAvailabilityScreen() {
  const router = useRouter();
  const active = useScreenIsActive();
  const { data, isError, isLoading } = useDriverDispatchStatusQuery(undefined, { skip: !active, refetchOnMountOrArgChange: true });
  return <SafeAreaView style={styles.screen}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retour" style={styles.back} onPress={() => router.back()}>
      <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
    </TouchableOpacity>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Alertes conducteur</Text>
      <Text style={styles.copy}>Aucune disponibilité à activer. Lorsqu’un passager réserve votre trajet publié, vous êtes averti automatiquement.</Text>
      <Text style={styles.label}>Les demandes près de vous</Text>
      <Text style={styles.copy}>Si vous êtes le conducteur éligible le plus proche avec un véhicule adapté, vous recevez une demande. Répondez avec « Accepter » ou « Refuser » depuis la notification.</Text>
      <Text style={styles.copy}>Votre position est actualisée pendant l’utilisation de l’app, avec votre autorisation. Elle reste utilisable quelques minutes lorsque vous quittez l’app. Une position trop ancienne n’est plus utilisée.</Text>
      {isLoading ? <ActivityIndicator color={Colors.primary} /> : isError
        ? <Text style={styles.copy}>Impossible de vérifier le service pour le moment.</Text>
        : data?.enabled && data.automatic
          ? <Text style={styles.hint}>Recherche automatique activée côté serveur. La dernière position reste valable au maximum {Math.round((data.positionFreshSeconds ?? 300) / 60)} minute(s).</Text>
          : <Text style={styles.copy}>Les demandes proches attendent l’activation ou la mise à jour du serveur.</Text>}
      <Text style={styles.label}>Téléphone verrouillé ou app en arrière-plan</Text>
      <Text style={styles.copy}>Autorisez les notifications et leur son dans les réglages du téléphone. Le mode silencieux, « Ne pas déranger » et les restrictions du système peuvent limiter les alertes.</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => { void Linking.openSettings().catch(() => {}); }}>
        <Text style={styles.buttonText}>Ouvrir les réglages du téléphone</Text>
      </TouchableOpacity>
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
});
