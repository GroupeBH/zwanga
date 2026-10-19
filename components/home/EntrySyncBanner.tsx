import { HOME_DASHBOARD_COLORS as c } from '@/features/home/homeDashboardTheme';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Small, non-modal status; the rest of Home remains interactive. */
export function EntrySyncBanner({ failed, offline, actionLabel, onAction }: {
  failed: boolean; offline: boolean; actionLabel?: string; onAction: () => void;
}) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.banner, { top: insets.top + 64 }]} testID="entry-sync-banner">
    {!failed && !offline && !actionLabel && <ActivityIndicator size="small" color={c.orange} />}
    <Text style={styles.text} accessibilityLiveRegion="polite">
      {actionLabel ? actionLabel === 'Reprendre mon trajet' ? 'Trajet en cours' : 'Une demande à consulter'
        : offline ? 'Hors connexion' : failed ? 'Mise à jour indisponible' : 'Mise à jour en cours…'}
    </Text>
    {(actionLabel || failed || offline) && <TouchableOpacity accessibilityRole="button" onPress={onAction}
      disabled={offline && !actionLabel} style={styles.action}>
      <Text style={[styles.label, offline && !actionLabel && styles.disabled]}>{actionLabel ?? 'Réessayer'}</Text>
    </TouchableOpacity>}
  </View>;
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', left: 16, right: 16, zIndex: 100, elevation: 6,
    minHeight: 48, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14,
    borderWidth: 1, borderColor: c.line, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { color: c.muted, fontSize: 13, flex: 1 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, maxWidth: '60%' },
  label: { color: c.orange, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
