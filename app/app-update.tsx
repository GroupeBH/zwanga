import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { STORE_URLS } from '@/features/app-updates/updatePolicy';
import { Colors } from '@/constants/styles';

export default function AppUpdateScreen() {
  const update = useAppUpdate(), router = useRouter();
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const lock = useRef(false);
  const url = Platform.OS === 'ios' ? STORE_URLS.ios : Platform.OS === 'android' ? STORE_URLS.android : null;
  const openStore = async () => {
    if (!url || lock.current) return;
    lock.current = true; setOpening(true); setError('');
    try { await Linking.openURL(url); }
    catch { setError('Impossible d’ouvrir le store. Réessayez ou recherchez Zwanga dans votre store.'); }
    finally { lock.current = false; setOpening(false); }
  };
  return <SafeAreaView style={styles.screen}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retour" style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
      <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
    </TouchableOpacity>
    <ScrollView contentContainerStyle={styles.content}>
      <Ionicons name="download-outline" size={38} color={Colors.primary} />
      <Text style={styles.title}>{update.release ? 'Une nouvelle version de Zwanga' : 'Mises à jour de Zwanga'}</Text>
      {update.isFetching && <ActivityIndicator accessibilityLabel="Vérification de la mise à jour" color={Colors.primary} />}
      <Text style={styles.copy}>{update.release ? `La version ${update.release.version} est disponible. Mettez Zwanga à jour pour profiter des dernières améliorations.`
        : update.isError ? 'La disponibilité n’a pas pu être vérifiée. Vous pouvez consulter votre store.' : 'Consultez votre store pour retrouver la dernière version disponible.'}</Text>
      {update.release?.notes ? <Text style={styles.copy}>{update.release.notes}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ busy: opening, disabled: opening || !url }} disabled={opening || !url} onPress={() => void openStore()} style={styles.primary}>
        {opening ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryText}>{update.release ? 'Mettre à jour' : Platform.OS === 'ios' ? 'Ouvrir l’App Store' : 'Ouvrir Google Play'}</Text>}
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}><Text style={styles.copy}>Plus tard</Text></TouchableOpacity>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.white }, back: { padding: 16, alignSelf: 'flex-start', minHeight: 44 },
  content: { padding: 24, gap: 20 }, title: { fontSize: 26, fontWeight: '700', color: Colors.gray[900] },
  copy: { color: Colors.gray[700], fontSize: 16, lineHeight: 24 }, error: { color: Colors.danger },
  primary: { backgroundColor: Colors.primary, borderRadius: 14, padding: 16, minHeight: 50, alignItems: 'center' },
  primaryText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
});
