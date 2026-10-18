import { Colors, FontWeights } from '@/constants/styles';
import { StyleSheet } from 'react-native';

/** Shared frame for compact list previews with independent action buttons. */
export const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1,
    borderColor: Colors.gray[200], marginBottom: 8,
  },
  featured: { borderColor: Colors.primary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  action: {
    flexGrow: 1, flexBasis: 96, minHeight: 44, paddingHorizontal: 8, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: 10, backgroundColor: Colors.gray[50],
  },
  actionText: { fontSize: 12, fontWeight: FontWeights.semibold, color: Colors.primary, flexShrink: 1, textAlign: 'center' },
  primary: { backgroundColor: Colors.primary },
  primaryText: { color: Colors.white },
  danger: { backgroundColor: Colors.danger + '0D' },
  dangerText: { color: Colors.danger },
  contact: { color: Colors.success },
  notice: { paddingHorizontal: 12, paddingBottom: 8, fontSize: 12, lineHeight: 17, color: Colors.gray[700] },
});
