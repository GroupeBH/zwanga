import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  referralAccessCard: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...CommonStyles.shadowSm,
  },
  referralAccessGradient: {
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  referralAccessIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  referralAccessContent: {
    flex: 1,
    minWidth: 0,
  },
  referralAccessTitle: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  referralAccessMeta: {
    marginTop: 4,
    color: '#FFF4EF',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
    lineHeight: 17,
  },
});
