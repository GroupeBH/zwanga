import { HOME_DASHBOARD_COLORS as c } from '@/features/home/homeDashboardTheme';
import { HomeRideLoaderVisual } from '@/components/home/HomeRideLoaderVisual';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = { failed: boolean; active: boolean; retrying: boolean; onRetry: () => void };

/** Role-neutral waiting state; its illustrated journey never opens a real map. */
export function HomeRoleLoader({ failed, active, retrying, onRetry }: Props) {
  const loading = !failed || retrying;
  return <SafeAreaView testID="home-role-loader" style={styles.screen} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content} bounces={false}>
      <View style={styles.identity}>
        <Text style={styles.brand}>Zwanga</Text>
        <View style={styles.brandLine} accessible={false} />
      </View>
      <HomeRideLoaderVisual running={loading && active} />
      <View style={styles.status} accessible accessibilityLiveRegion="polite"
        accessibilityRole={loading ? 'progressbar' : undefined} accessibilityState={{ busy: loading }}
        accessibilityLabel={loading ? 'Préparation de votre accueil' : 'Impossible de charger votre accueil'}>
        <Text style={styles.title}>{loading ? 'Préparation de votre accueil' : 'Votre accueil est indisponible'}</Text>
        {!loading && <Text style={styles.hint}>Vérifiez votre connexion et réessayez.</Text>}
      </View>
      {failed && !retrying && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Réessayer"
        accessibilityState={{ disabled: !active }} disabled={!active} onPress={onRetry}
        activeOpacity={0.8} style={[styles.retry, !active && styles.disabled]}>
        <Ionicons name="refresh-outline" size={18} color="#FFFFFF" accessible={false} />
        <Text style={styles.retryText}>Réessayer</Text>
      </TouchableOpacity>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.warm },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingTop: 32, paddingBottom: 64 },
  identity: { alignItems: 'center', marginBottom: 18 },
  brand: { fontSize: 38, fontWeight: '700', letterSpacing: -1.5, color: c.ink },
  brandLine: { width: 24, height: 3, borderRadius: 2, backgroundColor: c.orange, marginTop: 10 },
  status: { alignItems: 'center', gap: 10, maxWidth: 320, marginTop: 28, paddingHorizontal: 16 },
  title: { fontSize: 16, fontWeight: '500', lineHeight: 24, textAlign: 'center', color: c.muted },
  hint: { fontSize: 14, lineHeight: 21, textAlign: 'center', color: c.muted },
  retry: { marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.orange, minHeight: 48, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  disabled: { opacity: 0.5 },
});
