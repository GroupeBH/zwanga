import { HOME_DASHBOARD_COLORS as c } from '@/features/home/homeDashboardTheme';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/** Only show a verified activity to open; background sync stays silent on Home. */
export function EntrySyncBanner({ actionLabel, onAction }: {
  failed: boolean; offline: boolean; actionLabel?: string; onAction: () => void;
}) {
  if (!actionLabel) return null;
  return <View style={styles.banner} testID="entry-sync-banner">
    <Text style={styles.text} accessibilityLiveRegion="polite">
      {actionLabel === 'Reprendre mon trajet' ? 'Trajet en cours' : 'Une demande à consulter'}
    </Text>
    <TouchableOpacity accessibilityRole="button" onPress={onAction} style={styles.action}>
      <Text style={styles.label}>{actionLabel}</Text>
    </TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 48, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14,
    borderWidth: 1, borderColor: c.line, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { color: c.muted, fontSize: 13, flex: 1 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, maxWidth: '60%' },
  label: { color: c.orange, fontSize: 14, fontWeight: '600' },
});
