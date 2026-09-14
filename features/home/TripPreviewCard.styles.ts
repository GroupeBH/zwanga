import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { HOME_COLORS } from '@/features/home/homeModel';
import {
  StyleSheet
} from 'react-native';
export const styles = StyleSheet.create({
  tripPreviewCard: {
    minHeight: 208,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    padding: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  tripPreviewCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#FFFDFC',
  },
  tripPreviewTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  tripDriverInline: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripPreviewAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: Spacing.sm,
    backgroundColor: Colors.gray[100],
  },
  tripPreviewAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF0FF',
  },
  tripPreviewAvatarText: {
    color: HOME_COLORS.navy,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  tripPreviewDriverCopy: {
    flex: 1,
    minWidth: 0,
  },
  tripPreviewDriverName: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  tripPreviewMetaRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripPreviewRating: {
    marginLeft: 4,
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  tripPreviewPriceBlock: {
    alignItems: 'flex-end',
    flexShrink: 0,
    maxWidth: 118,
  },
  tripPreviewPrice: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  tripPreviewPriceNote: {
    marginTop: 1,
    color: HOME_COLORS.body,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
  },
  tripPreviewRoute: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    flexShrink: 1,
  },
  tripPreviewRail: {
    width: 18,
    alignItems: 'center',
    paddingVertical: 3,
    marginRight: Spacing.md,
  },
  tripPreviewRouteDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 4,
    backgroundColor: Colors.white,
  },
  tripPreviewStartDot: {
    borderColor: HOME_COLORS.success,
  },
  tripPreviewEndDot: {
    borderColor: Colors.primary,
  },
  tripPreviewRouteLine: {
    flex: 1,
    minHeight: 22,
    borderLeftWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: HOME_COLORS.body,
    marginVertical: 3,
  },
  tripPreviewRouteCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.sm,
  },
  tripPreviewRouteLabel: {
    color: HOME_COLORS.body,
    fontSize: 10,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.8,
  },
  tripPreviewRouteText: {
    marginTop: 2,
    color: HOME_COLORS.text,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  tripPreviewFooter: {
    marginTop: 'auto',
    paddingTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  tripPreviewChips: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    overflow: 'hidden',
  },
  tripPreviewChip: {
    flexShrink: 1,
    maxWidth: 96,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
  },
  tripPreviewChipText: {
    color: HOME_COLORS.navy,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  tripPreviewVehicleChip: {
    flexShrink: 1,
    maxWidth: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: HOME_COLORS.navySoft,
  },
  tripPreviewVehicleText: {
    color: HOME_COLORS.navy,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  tripPreviewBookedChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: '#DDF8EA',
  },
  tripPreviewBookedText: {
    color: HOME_COLORS.success,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  tripPreviewOpenButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  }
});
