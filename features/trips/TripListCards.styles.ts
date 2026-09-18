import { Colors, FontWeights } from '@/constants/styles';
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1,
    borderColor: Colors.gray[200], marginBottom: 8,
  },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  action: {
    flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, borderRadius: 10, backgroundColor: Colors.gray[50],
  },
  actionText: { fontSize: 12, fontWeight: FontWeights.semibold, color: Colors.primary },
  danger: { backgroundColor: Colors.danger + '0D' },
  dangerText: { color: Colors.danger },
});
