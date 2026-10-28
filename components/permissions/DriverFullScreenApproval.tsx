import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RideModal } from '@/features/navigation/RideModal';
import { RIDE_OVERLAY_PRIORITY } from '@/features/navigation/rideOverlayStore';
import { ACTION_COLORS } from '@/constants/actionColors';

type Props = { visible: boolean; busy: boolean; error: boolean; notificationsAllowed?: boolean; allowed?: boolean; channelReady?: boolean;
  onConfirm(): void; onClose(): void; onShow?(): void };

export function DriverFullScreenApproval({ visible, busy, error, notificationsAllowed = true, allowed = false, channelReady = true,
  onConfirm, onClose, onShow }: Props) {
  const needsSettings = Number(Platform.Version) >= 34 && !allowed;
  return <RideModal visible={visible} inApp transparent animationType="fade"
    priority={RIDE_OVERLAY_PRIORITY.information} onRequestClose={onClose} onShow={onShow}>
    <View style={styles.overlay}>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}>
        <ScrollView bounces={false} contentContainerStyle={styles.content}>
          <Ionicons name="phone-portrait-outline" size={36} color={ACTION_COLORS.orange} />
          <Text accessibilityRole="header" style={styles.title}>{notificationsAllowed ? 'Demandes en plein écran' : 'Activez les notifications'}</Text>
          <Text style={styles.copy}>{notificationsAllowed
            ? 'Voyez les nouvelles demandes même téléphone verrouillé.'
            : 'Recevez les alertes de nouvelles demandes de trajet.'}</Text>
          <Text style={styles.guide}>{!notificationsAllowed ? 'Activez « Autoriser les notifications ».'
            : needsSettings ? 'Activez « Autoriser les notifications en plein écran », puis revenez dans Zwanga.'
            : !channelReady ? 'Autorisez les alertes de trajet et leur affichage à l’écran dans les réglages Android.'
            : 'Touchez Activer pour utiliser cette option.'}</Text>
          <Text style={styles.copy}>Facultatif. Le téléphone reste verrouillé.</Text>
          {error && <Text accessibilityRole="alert" style={styles.copy}>Vérification impossible. Réessayez.</Text>}
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy, busy }}
            disabled={busy} onPress={onConfirm} style={[styles.primary, busy && styles.disabled]}>
            {busy && <ActivityIndicator color="#FFFFFF" />}
            <Text style={styles.primaryText}>{busy ? 'Un instant…' : error ? 'Réessayer'
              : !notificationsAllowed ? 'Ouvrir les notifications' : needsSettings ? 'Ouvrir les réglages'
              : !channelReady ? 'Autoriser les alertes de trajet' : 'Activer'}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.later}>
            <Text style={styles.laterText}>Plus tard</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  </RideModal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%' },
  content: { padding: 24, gap: 16 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: '#1E2A4A' },
  copy: { fontSize: 16, lineHeight: 24, color: '#4B5563' },
  guide: { fontSize: 16, lineHeight: 24, color: '#1E2A4A', fontWeight: '600' },
  primary: { minHeight: 52, borderRadius: 18, padding: 14, backgroundColor: ACTION_COLORS.orange,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.65 },
  later: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontSize: 16, color: '#4B5563' },
});
