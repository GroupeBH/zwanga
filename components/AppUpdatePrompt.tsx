import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { STORE_URLS } from '@/features/app-updates/updatePolicy';
import { RideModal } from '@/features/navigation/RideModal';
import { RIDE_OVERLAY_PRIORITY } from '@/features/navigation/rideOverlayStore';
import { Colors } from '@/constants/styles';

/** Optional store prompt: uses the existing JS overlay, never stacks UIKit modals. */
export function AppUpdatePrompt({ enabled = true }: { enabled?: boolean }) {
  const { release, active } = useAppUpdate();
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const lock = useRef(false);
  const key = release ? `zwanga.update-dismissed.${release.platform}.${release.id}` : null;
  const storageKey = release ? `zwanga.update-dismissed.${release.platform}` : null;
  useEffect(() => {
    if (!key || !storageKey || !active || !enabled) return;
    let current = true;
    void AsyncStorage.getItem(storageKey).then(value => {
      if (!current) return;
      const saved = value ? JSON.parse(value) : null;
      setHiddenKey(saved?.key === key && Number.isFinite(saved.until) && saved.until > Date.now() ? key : null);
      setLoadedKey(key);
    }).catch(() => { if (current) setLoadedKey(key); });
    return () => { current = false; };
  }, [key, storageKey, active, enabled]);

  const postpone = () => {
    if (!key || !storageKey) return;
    setHiddenKey(key);
    void AsyncStorage.setItem(storageKey, JSON.stringify({ key, until: Date.now() + 86400000 })).catch(() => {});
  };
  const openStore = async () => {
    if (!release || !key || lock.current) return;
    lock.current = true;
    setOpening(true);
    setError(null);
    try {
      await Linking.openURL(STORE_URLS[release.platform]);
      postpone();
    } catch {
      setError({ key, message: 'Impossible d’ouvrir le store. Réessayez ou recherchez Zwanga dans votre store.' });
    } finally {
      lock.current = false;
      setOpening(false);
    }
  };
  const dismiss = () => { if (!lock.current) postpone(); };
  if (!enabled || !active || !release || !key || loadedKey !== key || hiddenKey === key) return null;

  return <RideModal inApp visible transparent animationType="fade"
    priority={RIDE_OVERLAY_PRIORITY.information} onRequestClose={dismiss}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <ScrollView style={styles.body} contentContainerStyle={styles.content} bounces={false}>
          <View style={styles.icon}><Ionicons name="download-outline" size={30} color={Colors.primary} /></View>
          <Text accessibilityRole="header" style={styles.title}>Mise à jour disponible</Text>
          <Text style={styles.version}>Zwanga · version {release.version}</Text>
          <Text style={styles.copy}>Profitez des dernières améliorations de Zwanga.</Text>
          {release.notes.trim() ? <Text style={styles.notes}>{release.notes}</Text> : null}
          <Text style={styles.storeHint}>La mise à jour se poursuit dans {release.platform === 'ios' ? 'l’App Store' : 'Google Play'}.</Text>
          {error?.key === key ? <Text accessibilityRole="alert" style={styles.error}>{error.message}</Text> : null}
        </ScrollView>
        <View style={styles.actions}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mettre à jour"
            accessibilityState={{ busy: opening, disabled: opening }} disabled={opening}
            onPress={() => void openStore()} style={styles.primary}>
            {opening ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryText}>Mettre à jour</Text>}
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Plus tard"
            accessibilityHint="Reporter ce rappel de 24 heures" disabled={opening}
            onPress={dismiss} style={styles.secondary}>
            <Text style={styles.secondaryText}>Plus tard</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </RideModal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.48)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 440, maxHeight: '90%', borderRadius: 24, backgroundColor: Colors.white, overflow: 'hidden' },
  body: { flexGrow: 0, flexShrink: 1 },
  content: { padding: 24, paddingBottom: 8, gap: 12 },
  icon: { width: 56, height: 56, backgroundColor: Colors.primary + '12', borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: Colors.gray[900] },
  version: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  copy: { fontSize: 16, lineHeight: 23, color: Colors.gray[700] },
  notes: { fontSize: 14, lineHeight: 21, color: Colors.gray[700] },
  storeHint: { fontSize: 13, lineHeight: 19, color: Colors.gray[600] },
  error: { fontSize: 14, lineHeight: 21, color: Colors.danger },
  actions: { padding: 20, paddingTop: 12, gap: 4 },
  primary: { minHeight: 50, padding: 14, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, color: Colors.white, fontWeight: '700' },
  secondary: { minHeight: 46, padding: 12, justifyContent: 'center', alignItems: 'center' },
  secondaryText: { fontSize: 15, color: Colors.gray[600], fontWeight: '600' },
});
