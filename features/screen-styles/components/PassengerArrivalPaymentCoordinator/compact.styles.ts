import { StyleSheet } from 'react-native';
import { Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';

/** One amount, quiet separators, compact selectors and a stable action footer. */
export const styles = StyleSheet.create({
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 4, backgroundColor: Colors.gray[200], marginBottom: 12 },
  title: { color: Colors.gray[900], fontSize: 23, fontWeight: FontWeights.bold, marginTop: 3 },
  destinationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  amountCard: { marginTop: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray[200] },
  amountValue: { color: Colors.gray[900], fontSize: 32, fontWeight: FontWeights.bold, marginTop: 4, flexShrink: 1 },
  sectionTitle: { color: Colors.gray[900], fontSize: FontSizes.sm, fontWeight: FontWeights.bold, marginTop: 14, marginBottom: 8 },
  options: { gap: 6 },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white },
  optionTitle: { color: Colors.gray[800], fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  pointsCard: { marginTop: 12, paddingVertical: 8 },
  breakdownRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  breakdownLabel: { flex: 1, color: Colors.gray[600], fontSize: FontSizes.sm },
  breakdownValue: { flex: 1, color: Colors.gray[800], fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, textAlign: 'right' },
  electronicCard: { marginTop: 12 },
  channelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  channelOption: { flexGrow: 1, flexBasis: '44%', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.gray[200] },
  channelTitle: { flexShrink: 1, color: Colors.gray[800], fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  summaryRows: { marginTop: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray[200] },
  summaryLabel: { flex: 1, color: Colors.gray[600], fontSize: FontSizes.sm },
  payButton: { minHeight: 50, borderRadius: 14, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  payButtonText: { flexShrink: 1, color: Colors.white, fontSize: FontSizes.base, fontWeight: FontWeights.bold, textAlign: 'center' },
});
