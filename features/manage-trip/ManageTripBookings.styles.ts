import { Colors, FontWeights } from '@/constants/styles';
import { StyleSheet } from 'react-native';

export const bookingStyles = StyleSheet.create({
  bookingCard: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[200],
    borderRadius: 12, padding: 10, marginBottom: 8,
  },
  bookingHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passengerProfile: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bookingInfo: { flex: 1, minWidth: 0 },
  bookingName: { fontSize: 14, lineHeight: 18, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  bookingMeta: { fontSize: 12, lineHeight: 16, color: Colors.gray[600], marginTop: 2 },
  destination: { fontSize: 12, lineHeight: 16, color: Colors.gray[600], marginTop: 2 },
  statusColumn: { maxWidth: '40%', alignItems: 'flex-end', gap: 4 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: { fontSize: 11, lineHeight: 14, fontWeight: FontWeights.semibold },
  bookingFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  actionButton: {
    flexGrow: 1, minWidth: 88, minHeight: 44, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 6, gap: 6, borderRadius: 10,
  },
  actionText: { fontSize: 12, fontWeight: FontWeights.semibold, color: Colors.white },
  bookingStatusBadge: { flexBasis: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  bookingStatusBadgeInfo: { backgroundColor: 'transparent' },
  bookingStatusBadgeSuccess: { backgroundColor: 'transparent' },
  bookingStatusBadgeSecondary: { backgroundColor: 'transparent' },
  bookingStatusText: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: FontWeights.medium },
  rateButtonInCard: {
    minHeight: 44, paddingHorizontal: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  actionIconButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary + '10',
    alignItems: 'center', justifyContent: 'center',
  },
});
