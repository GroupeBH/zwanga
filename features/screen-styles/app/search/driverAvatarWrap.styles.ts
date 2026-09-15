import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { SEARCH_COLORS } from "@/features/search/searchTheme";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  driverAvatarWrap: {
    position: 'relative',
    width: 62,
    height: 62,
  },
  driverAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.gray[100],
  },
  driverAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarText: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  driverVerifiedBadge: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.successDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  driverCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 4,
  },
  driverName: {
    color: SEARCH_COLORS.ink,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.medium,
  },
  driverMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverMetaText: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    marginLeft: 4,
  },
  driverMetaDot: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    marginHorizontal: 4,
  },
  priceBlock: {
    alignItems: 'flex-end',
    minWidth: 104,
  },
  resultPrice: {
    color: Colors.primaryDark,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    lineHeight: 32,
  },
  priceUnit: {
    marginTop: 4,
    color: SEARCH_COLORS.body,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  requestRoutePanel: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: SEARCH_COLORS.panel,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  requestRouteContent: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  requestRouteLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  requestRouteText: {
    flex: 1,
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  requestMetaGrid: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  requestMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  requestMetaText: {
    flex: 1,
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    lineHeight: 19,
  },
  requestDescription: {
    marginTop: Spacing.md,
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  tripTimingPanel: {
    marginTop: Spacing.lg,
    minHeight: 98,
    borderRadius: BorderRadius.lg,
    backgroundColor: SEARCH_COLORS.panel,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  timingAccent: {
    alignSelf: 'stretch',
    width: 4,
  },
  departureTimeBlock: {
    width: 124,
    paddingLeft: Spacing.md,
  },
  departureTime: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    lineHeight: 18,
  },
  departureLabel: {
    marginTop: 5,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  durationBlock: {
    width: 74,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  durationLine: {
    width: 34,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: SEARCH_COLORS.border,
  },
  durationText: {
    color: SEARCH_COLORS.body,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  vehicleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: Spacing.md,
  },
  vehiclePill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    backgroundColor: SEARCH_COLORS.softBlue,
  },
  vehiclePillText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  vehicleSubtext: {
    marginTop: 5,
    color: SEARCH_COLORS.body,
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  arrivalEstimateText: {
    marginTop: 5,
    color: Colors.primary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  routeSummary: {
    marginTop: Spacing.md,
  },
  routeSummaryText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  resultBadges: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  greenBadge: {
    minHeight: 30,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#65F396',
  },
  greenBadgeText: {
    color: '#053B1B',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  instantBadge: {
    minHeight: 30,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F9D8CF',
  },
  instantBadgeText: {
    color: SEARCH_COLORS.body,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  }
});
