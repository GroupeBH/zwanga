import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { HOME_COLORS } from '@/features/home/homeModel';
import {
  Platform,
  StyleSheet
} from 'react-native';
export const styles = StyleSheet.create({
  tripsSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 11,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: Colors.white,
    paddingTop: Spacing.sm,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  sheetHeader: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetHeaderCopy: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 2,
  },
  sheetTitle: {
    color: HOME_COLORS.text,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  sheetSubtitle: {
    marginTop: 2,
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  sheetHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  seeAllText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  sheetModeSwitch: {
    minHeight: 40,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
    padding: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    flexDirection: 'row',
    gap: 4,
  },
  sheetModeOption: {
    flex: 1,
    minHeight: 32,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  sheetModeOptionActive: {
    backgroundColor: HOME_COLORS.navy,
  },
  sheetModeText: {
    color: HOME_COLORS.navy,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  sheetModeTextActive: {
    color: Colors.white,
  },
  sheetModeCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
  },
  sheetModeCountBadgeActive: {
    borderColor: 'rgba(255,255,255,0.42)',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  sheetModeCountText: {
    color: HOME_COLORS.navy,
    fontSize: 10,
    fontWeight: FontWeights.bold,
  },
  sheetModeCountTextActive: {
    color: Colors.white,
  },
  sheetToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
  },
  tripsHorizontalContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  sheetState: {
    marginHorizontal: Spacing.xl,
    minHeight: 132,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  sheetStateText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '14',
  },
  retryButtonText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  emptyCard: {
    marginHorizontal: Spacing.xl,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: HOME_COLORS.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  emptyTextBlock: {
    flex: 1,
  },
  emptyTitle: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  emptyText: {
    marginTop: 2,
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  }
});
