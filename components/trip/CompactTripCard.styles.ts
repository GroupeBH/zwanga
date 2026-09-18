import { BorderRadius, Colors, FontWeights, Spacing } from '@/constants/styles';
import { HOME_COLORS } from '@/features/home/homeModel';
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 6,
    minHeight: 76,
  },
  selected: { borderColor: Colors.primary, backgroundColor: '#FFFCFA' },
  embedded: { borderWidth: 0, backgroundColor: 'transparent' },
  disabled: { opacity: 0.72 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 16, fontWeight: FontWeights.semibold, color: Colors.gray[700] },
  priceBlock: { maxWidth: '50%', flexShrink: 0, alignItems: 'flex-end' },
  price: { fontSize: 14, lineHeight: 19, fontWeight: FontWeights.bold, color: HOME_COLORS.ink },
  priceHint: { fontSize: 11, fontWeight: FontWeights.regular, color: Colors.gray[600] },
  inlineRoute: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  route: { gap: 3 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  place: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 19, color: HOME_COLORS.ink, fontWeight: FontWeights.bold },
  departureDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: HOME_COLORS.success },
  arrivalDot: { width: 6, height: 6, borderRadius: 1, backgroundColor: Colors.primary },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metadata: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 16, color: Colors.gray[700] },
  badge: { maxWidth: '30%', fontSize: 12, lineHeight: 16, color: HOME_COLORS.success, fontWeight: FontWeights.bold },
  secondary: { fontSize: 12, lineHeight: 16, color: Colors.gray[600] },
  identityCopy: { flex: 1, minWidth: 0, gap: 2 },
  identityMetadata: { fontSize: 12, lineHeight: 16, color: Colors.gray[700] },
  avatar: {
    width: 32, height: 32, borderRadius: 16, flexShrink: 0, overflow: 'hidden',
    backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 11, fontWeight: FontWeights.semibold, color: Colors.gray[600] },
  avatarPhoto: { position: 'absolute', top: 0, left: 0, width: 32, height: 32, borderRadius: 16 },
});
