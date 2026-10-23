import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RideModal } from '@/features/navigation/RideModal';
import { ACTION_COLORS } from '@/constants/actionColors';

type Props = {
  visible: boolean; busy: boolean; loaded: boolean; loadError: boolean;
  permission: boolean; foregroundPermission: boolean; settingsRequired: boolean; message: string;
  onConfirm: () => void; onClose: () => void; priority?: number;
};

/** In-app validation, not an imitation of the OS permission dialog. */
export function BackgroundLocationApproval(props: Props) {
  const { visible, busy, loaded, loadError, permission, foregroundPermission, settingsRequired, message, onConfirm, onClose } = props;
  const blocked = busy || (!loaded && !loadError);
  const choice = Platform.OS === 'ios' ? 'Toujours' : 'Toujours autoriser';
  const androidSettings = Platform.OS === 'android' && Number(Platform.Version) >= 30;
  return <RideModal visible={visible} inApp transparent animationType="fade" priority={props.priority} onRequestClose={onClose}>
    <View style={styles.overlay}>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.content} bounces={false}>
          <View style={styles.heading}>
            <Ionicons name="location" size={26} color={ACTION_COLORS.orange} />
            <Text accessibilityRole="header" style={styles.title}>Autoriser ma localisation</Text>
          </View>
          <Text style={styles.lead}>Recevez les demandes proches, même écran éteint.</Text>
          <Text style={styles.copy}>Hors trajet, Zwanga collecte et envoie votre position au serveur environ toutes les 3 minutes, même dans une autre application.</Text>
          {loadError ? <Text accessibilityLiveRegion="polite" style={styles.copy}>Impossible de vérifier l’autorisation. Réessayez.</Text>
            : permission ? <Text style={styles.copy}>Votre téléphone a déjà donné son accord. Confirmez pour reprendre le partage hors trajet.</Text>
              : settingsRequired ? <View style={styles.guide}>
                <Text style={styles.guideTitle}>Le téléphone impose ce dernier réglage</Text>
                <Text style={styles.copy}>{Platform.OS === 'ios'
                  ? `1. Touchez « Position » dans les réglages de Zwanga.\n2. Choisissez « ${choice} ».\n3. Revenez dans Zwanga.`
                  : `1. Touchez « Autorisations », puis « Position ».\n2. Choisissez « ${choice} ».\n3. Revenez dans Zwanga.`}</Text>
              </View> : <Text style={styles.copy}>{!foregroundPermission
                ? 'Validez d’abord la position dans la fenêtre du téléphone. Nous vous demanderons ensuite l’accès même écran éteint.'
                : androidSettings
                  ? `Android peut ouvrir les autorisations de Zwanga. Choisissez « ${choice} », puis revenez ici.`
                  : `Dans la fenêtre du téléphone, choisissez « ${choice} ».`}</Text>}
          {message ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{message}</Text> : null}
          <TouchableOpacity accessibilityRole="button" disabled={blocked}
            accessibilityState={{ disabled: blocked, busy }} onPress={onConfirm}
            style={[styles.primary, blocked && styles.disabled]}>
            {blocked ? <ActivityIndicator color="#FFFFFF" /> : null}
            <Text style={styles.primaryText}>{blocked ? 'Un instant…' : loadError ? 'Réessayer'
              : settingsRequired ? 'Ouvrir les autorisations' : 'Autoriser'}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button"
            style={styles.later} onPress={onClose}>
            <Text style={styles.laterText}>Plus tard</Text>
          </TouchableOpacity>
          <Text style={styles.footnote}>Vous pouvez continuer sans autoriser. Désactivation possible dans Profil → Alertes conducteur.</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  </RideModal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%' },
  content: { padding: 24, gap: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 22, lineHeight: 28, fontWeight: '700', color: '#1E2A4A' },
  lead: { fontSize: 17, lineHeight: 24, fontWeight: '600', color: '#1F2937' },
  copy: { fontSize: 15, lineHeight: 23, color: '#4B5563' },
  guide: { gap: 6, borderLeftWidth: 3, borderLeftColor: ACTION_COLORS.orange, paddingLeft: 12 },
  guideTitle: { fontSize: 15, lineHeight: 22, fontWeight: '700', color: '#1F2937' },
  feedback: { fontSize: 14, lineHeight: 21, color: '#9A3412' },
  primary: { minHeight: 52, borderRadius: 18, padding: 14, backgroundColor: ACTION_COLORS.orange,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.65 },
  later: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  laterText: { fontSize: 16, color: '#4B5563' },
  footnote: { fontSize: 13, lineHeight: 19, color: '#6B7280' },
});
