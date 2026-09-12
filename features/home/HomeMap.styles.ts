import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { HOME_COLORS } from '@/features/home/homeModel';
import {
  StyleSheet
} from 'react-native';
export const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  userLocationCallout: {
    width: 236,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    ...CommonStyles.shadowMd,
  },
  userLocationCalloutTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  userLocationCalloutIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HOME_COLORS.navy,
  },
  userLocationCalloutTitle: {
    flex: 1,
    color: HOME_COLORS.ink,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  userLocationCalloutAddress: {
    marginTop: Spacing.sm,
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    lineHeight: 19,
    fontWeight: FontWeights.medium,
  }
});
