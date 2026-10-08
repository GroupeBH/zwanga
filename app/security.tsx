import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PoliceContactPanel } from '@/components/PoliceContactPanel';
import { Colors } from '@/constants/styles';

// Keep old links safe, without mounting contact permissions or nested native modals.
export default function SecurityScreen() {
  const router = useRouter();
  return <SafeAreaView style={styles.screen}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retour" onPress={() => router.back()} style={styles.back}>
      <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
    </TouchableOpacity>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Votre sécurité</Text>
      <Text style={styles.copy}>Partagez votre trajet avec vos proches pour votre sécurité.</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => router.navigate('/trips')} style={styles.button}>
        <Text style={styles.buttonText}>Voir mes trajets</Text>
      </TouchableOpacity>
      <PoliceContactPanel presentation="strip" title="SOS — Police" />
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.white }, back: { padding: 16, alignSelf: 'flex-start' },
  content: { padding: 24, gap: 20 }, title: { fontSize: 24, fontWeight: '700', color: Colors.gray[900] },
  copy: { fontSize: 16, lineHeight: 24, color: Colors.gray[700] },
  button: { padding: 16, borderRadius: 14, backgroundColor: Colors.primary },
  buttonText: { textAlign: 'center', fontSize: 16, fontWeight: '700', color: Colors.white },
});





