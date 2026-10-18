import { Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xxl },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.gray[100], justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.gray[900], textAlign: 'center', marginTop: Spacing.md },
  emptyText: { fontSize: FontSizes.sm, color: Colors.gray[600], textAlign: 'center', lineHeight: 21, marginTop: Spacing.sm, maxWidth: 320 },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginTop: Spacing.xs, alignSelf: 'center' },
  secondaryButtonText: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, textAlign: 'center' },
});
