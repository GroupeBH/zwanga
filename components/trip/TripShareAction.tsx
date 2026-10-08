import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/styles';

export function TripShareAction({ onShare, disabled = false, compact = false }: {
  onShare: () => Promise<void>; disabled?: boolean; compact?: boolean;
}) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const share = async () => {
    if (disabled || lock.current) return;
    lock.current = true; setBusy(true);
    try { await onShare(); }
    catch { Alert.alert('Partage indisponible', 'Le partage n’a pas pu être ouvert. Veuillez réessayer.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel="Partager mon trajet"
    accessibilityHint="Ouvre le partage du téléphone. Vous choisissez à qui envoyer le lien de suivi."
    accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy}
    style={[styles.action, compact && styles.compact, (disabled || busy) && styles.disabled]}
    onPress={() => { void share(); }}>
    {busy ? <ActivityIndicator color={Colors.primary} /> : <Ionicons name="share-social-outline" size={22} color={Colors.primary} />}
    <View style={styles.copy}>
      <Text style={styles.title}>{busy ? 'Préparation du partage…' : 'Partager mon trajet'}</Text>
      {!compact && <Text style={styles.hint}>Partagez votre trajet avec vos proches pour votre sécurité.</Text>}
    </View>
    <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
  </TouchableOpacity>;
}
const styles = StyleSheet.create({
  action: { flexDirection: 'row', flexShrink: 1, minWidth: 0, alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, backgroundColor: '#FFF4EE', minHeight: 52 },
  compact: { paddingVertical: 10, minHeight: 44 },
  copy: { flex: 1, minWidth: 0 }, title: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
  hint: { color: Colors.gray[700], fontSize: 13, lineHeight: 18, marginTop: 4 }, disabled: { opacity: 0.5 },
});
