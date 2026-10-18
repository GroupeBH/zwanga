import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/styles';
import { useRequestPassengerContact } from '@/hooks/request-detail/useRequestPassengerContact';
import { NavigationContactModal } from '@/features/navigation/NavigationContactModal';

export function RequestPassengerContact({ requestId, enabled, validUntil }: {
  requestId: string; enabled: boolean; validUntil?: number;
}) {
  const contact = useRequestPassengerContact(requestId, enabled, validUntil);
  return <View style={styles.section}>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: contact.disabled, busy: contact.busy }}
      disabled={contact.disabled} onPress={() => { void contact.open(); }} style={[styles.button, contact.disabled && styles.disabled]}>
      {contact.busy ? <ActivityIndicator color={Colors.primary} /> : <Ionicons name="call-outline" size={20} color={Colors.primary} />}
      <Text style={styles.label}>{contact.busy ? 'Ouverture…' : 'Contacter le passager'}</Text>
    </TouchableOpacity>
    <Text style={styles.hint}>{contact.offline ? 'Reconnectez-vous à internet pour charger le contact.' : 'Pour discuter du prix avant d’accepter.'}</Text>
    {contact.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{contact.error}</Text> : null}
    {contact.contacts && <NavigationContactModal role="driver" contacts={contact.contacts} onClose={contact.close} />}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 6, marginTop: 12 },
  button: { minHeight: 48, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center',
    padding: 12, borderRadius: 14, backgroundColor: Colors.primary + '12' },
  label: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  hint: { fontSize: 13, color: Colors.gray[600], textAlign: 'center' },
  error: { fontSize: 14, lineHeight: 20, color: Colors.danger }, disabled: { opacity: 0.6 },
});
