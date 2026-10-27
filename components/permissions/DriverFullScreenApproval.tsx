import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RideModal } from '@/features/navigation/RideModal';
import { RIDE_OVERLAY_PRIORITY } from '@/features/navigation/rideOverlayStore';
import { ACTION_COLORS } from '@/constants/actionColors';

type Props = { visible: boolean; busy: boolean; error: boolean; onConfirm(): void; onClose(): void; onShow?(): void };

export function DriverFullScreenApproval({ visible, busy, error, onConfirm, onClose, onShow }: Props) {
  return <RideModal visible={visible} inApp transparent animationType="fade"
    priority={RIDE_OVERLAY_PRIORITY.information} onRequestClose={onClose} onShow={onShow}>
    <View style={styles.overlay}>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}>
        <ScrollView bounces={false} contentContainerStyle={styles.content}>
          <Ionicons name="phone-portrait-outline" size={36} color={ACTION_COLORS.orange} />
          <Text accessibilityRole="header" style={styles.title}>Voyez les demandes, même écran éteint</Text>
          <Text style={styles.copy}>Une nouvelle demande ou réservation pourra apparaître sur l’écran verrouillé pour vous permettre de répondre rapidement.</Text>
          {Number(Platform.Version) >= 34 && <Text style={styles.guide}>Sur l’écran Android, activez « Autoriser les notifications en plein écran », puis revenez dans Zwanga avec le bouton Retour.</Text>}
          <Text style={styles.copy}>C’est facultatif. Sans cette option, vous gardez les notifications habituelles. Le téléphone reste verrouillé.</Text>
          {error && <Text accessibilityRole="alert" style={styles.copy}>Impossible de vérifier l’autorisation. Réessayez ou choisissez « Plus tard ».</Text>}
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy, busy }}
            disabled={busy} onPress={onConfirm} style={[styles.primary, busy && styles.disabled]}>
            {busy && <ActivityIndicator color="#FFFFFF" />}
            <Text style={styles.primaryText}>{busy ? 'Un instant…' : 'Autoriser'}</Text>
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
