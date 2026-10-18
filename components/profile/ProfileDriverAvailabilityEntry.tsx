import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDriverDispatchStatusQuery } from '@/store/api/driverDispatchApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { styles as menuStyles } from '@/features/profile/ProfileMenu.styles';
import { Colors } from '@/constants/styles';

/** Mounted only for a driver confirmed by the existing server-backed profile. */
export function ProfileDriverAvailabilityEntry() {
  const router = useRouter();
  const active = useScreenIsActive();
  const { data } = useDriverDispatchStatusQuery(undefined, { skip: !active, refetchOnMountOrArgChange: true });
  if (!data?.enabled) return null;
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel="Alertes conducteur"
    accessibilityHint="Comprendre les notifications automatiques de réservations et de commandes proches."
    onPress={() => router.push('/driver-availability')}
    style={[menuStyles.menuItem, menuStyles.menuItemBorder]}>
    <View style={menuStyles.menuIcon}>
      <Ionicons name="location-outline" size={20} color={Colors.gray[600]} />
    </View>
    <View style={styles.copy}>
      <Text style={[menuStyles.menuText, styles.title]}>Alertes conducteur</Text>
      <Text style={styles.description}>Réservations et commandes proches, automatiquement</Text>
    </View>
    <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  copy: { flex: 1, minWidth: 0, marginRight: 8 },
  title: { flex: 0 },
  description: { fontSize: 13, lineHeight: 18, color: Colors.gray[600], marginTop: 3 },
});
