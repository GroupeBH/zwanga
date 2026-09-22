import { Colors, FontSizes, Spacing } from '@/constants/styles';
import { styles as menuStyles } from '@/features/profile/ProfileMenu.styles';
import { useStoreReview } from '@/hooks/useStoreReview';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/** Kept separate from passenger/driver reviews: these reviews concern the app itself. */
export function ProfileStoreReviewButton() {
  const { storeName, isAvailable, isOpening, openReview } = useStoreReview();
  // Native support is checked on tap, without loading the SDK on every render.
  if (!isAvailable) return null;
  return (
    <TouchableOpacity
      style={[menuStyles.menuItem, styles.row]}
      onPress={openReview}
      disabled={isOpening}
      accessibilityRole="button"
      accessibilityLabel="Noter l’application"
      accessibilityHint={`Demande la fenêtre de notation ${storeName}, sans quitter l’application.`}
      accessibilityState={{ disabled: isOpening, busy: isOpening }}
    >
      <View style={menuStyles.menuIcon}>
        <Ionicons name="star-half-outline" size={20} color={Colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={[menuStyles.menuText, styles.title]}>Noter l’application</Text>
        <Text style={styles.description}>Donner votre avis sans quitter Zwanga</Text>
      </View>
      {isOpening ? <ActivityIndicator size="small" color={Colors.primary} />
        : <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.gray[50], minHeight: 64 },
  copy: { flex: 1, minWidth: 0, marginRight: Spacing.sm },
  title: { flex: 0 },
  description: { color: Colors.gray[500], fontSize: FontSizes.sm, marginTop: 2 },
});
