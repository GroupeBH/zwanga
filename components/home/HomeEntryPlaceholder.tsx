import { HOME_DASHBOARD_COLORS as c } from '@/features/home/homeDashboardTheme';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

/** No assumed role, map, location subscription or driver/passenger business actions. */
export function HomeEntryPlaceholder({ failed, fetching, onRetry }: {
  failed: boolean; fetching: boolean; onRetry: () => void;
}) {
  const router = useRouter();
  return <SafeAreaView style={styles.screen} testID="home-entry-placeholder">
    <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.brand}>Zwanga</Text>
    <Text style={styles.title}>Bienvenue</Text>
    <Text style={styles.hint} accessibilityLiveRegion="polite">
      {failed ? 'Votre profil ne peut pas être mis à jour pour le moment.' : 'Votre accueil se met à jour…'}
    </Text>
    <View style={styles.actions}>
      <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/trips')} style={styles.primary}>
        <Text style={styles.primaryText}>Mes trajets</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/profile')} style={styles.secondary}>
        <Text style={styles.secondaryText}>Mon profil</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/support')} style={styles.secondary}>
        <Text style={styles.secondaryText}>Besoin d’aide ?</Text>
      </TouchableOpacity>
      {failed && <TouchableOpacity accessibilityRole="button" disabled={fetching} onPress={onRetry} style={styles.secondary}>
        <Text style={styles.secondaryText}>{fetching ? 'Mise à jour…' : 'Réessayer'}</Text>
      </TouchableOpacity>}
    </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.warm },
  content: { flexGrow: 1, padding: 24 },
  brand: { fontSize: 28, fontWeight: '700', color: c.orange, marginVertical: 24 },
  title: { fontSize: 24, fontWeight: '600', color: c.ink, marginTop: 24 },
  hint: { fontSize: 16, color: c.muted, lineHeight: 24, marginTop: 12 },
  actions: { marginTop: 24, gap: 12 },
  primary: { backgroundColor: c.orange, borderRadius: 16, minHeight: 50, justifyContent: 'center', alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondary: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  secondaryText: { color: c.blue, fontSize: 16, fontWeight: '500' },
});
