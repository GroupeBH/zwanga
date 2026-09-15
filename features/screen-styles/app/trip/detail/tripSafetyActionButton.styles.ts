import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  tripSafetyActionButton: {
    minHeight: 60,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  tripSafetySosButton: {
    backgroundColor: Colors.danger,
    borderColor: Colors.danger,
  },
  tripSafetyTrustedButton: {
    backgroundColor: Colors.primary + '08',
    borderColor: Colors.primary + '35',
  },
  tripSafetyActionDisabled: {
    backgroundColor: Colors.gray[100],
    borderColor: Colors.gray[200],
  },
  tripSafetyActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary + '24',
  },
  tripSafetySosIcon: {
    borderColor: Colors.white + '66',
  },
  tripSafetyActionCopy: {
    flex: 1,
    minWidth: 0,
  },
  tripSafetyActionTitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
  },
  tripSafetyActionTitleDisabled: {
    color: Colors.gray[500],
  },
  tripSafetySosTitle: {
    color: Colors.white,
    fontSize: FontSizes.base,
  },
  tripSafetyActionSubtitle: {
    marginTop: 2,
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    lineHeight: 17,
  },
  tripSafetyActionSubtitleDisabled: {
    color: Colors.gray[500],
  },
  tripSafetySosSubtitle: {
    color: 'rgba(255,255,255,0.85)',
  },
  securityReminderCard: {
    borderColor: Colors.secondary + '35',
    backgroundColor: Colors.secondary + '08',
  },
  securityReminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  securityReminderTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  securityReminderText: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  securityReminderVehicleBox: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    padding: Spacing.sm,
    gap: 2,
  },
  securityReminderVehicleLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.semibold,
    textTransform: 'uppercase',
  },
  securityReminderVehicleValue: {
    fontSize: FontSizes.sm,
    color: Colors.gray[900],
    fontWeight: FontWeights.semibold,
  },
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeIconContainer: {
    alignItems: 'center',
    marginRight: Spacing.md,
    width: 32,
  },
  routeIconStart: {
    width: 32,
    height: 32,
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeIconEnd: {
    width: 32,
    height: 32,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeDivider: {
    width: 2,
    height: 44,
    backgroundColor: Colors.gray[300],
    marginVertical: 4,
  },
  routeContent: {
    flex: 1,
    paddingBottom: Spacing.md,
  },
  routeName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    fontSize: 16,
    marginBottom: 2,
  },
  routeAddress: {
    fontSize: 13,
    color: Colors.gray[500],
    lineHeight: 18,
  },
  routeTime: {
    fontSize: 13,
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
    marginTop: 6,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  driverAvatar: {
    width: 56,
    height: 56,
    backgroundColor: Colors.gray[200],
    borderRadius: BorderRadius.full,
    marginRight: Spacing.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverDetails: {
    flex: 1,
  },
  driverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  driverName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    fontSize: 17,
    flex: 1,
  },
  driverProBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  driverProBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: FontWeights.bold,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRating: {
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
    marginLeft: 4,
    fontSize: 14,
  },
  driverDot: {
    width: 3,
    height: 3,
    backgroundColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
    marginHorizontal: Spacing.sm,
  },
  driverVehicle: {
    color: Colors.gray[500],
    fontSize: 13,
  },
  driverActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  driverActionButton: {
    flex: 1,
    backgroundColor: Colors.white,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  driverActionButtonGreen: {
    borderColor: Colors.success + '30',
  },
  driverActionText: {
    color: Colors.gray[800],
    fontWeight: FontWeights.bold,
    marginLeft: 8,
    fontSize: 14,
  },
  driverReviewLink: {
    marginTop: 4,
  },
  driverReviewLinkText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: FontWeights.bold,
  },
  driverReviewLinkTextDisabled: {
    color: Colors.gray[400],
  },
  detailsList: {
    gap: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  detailLabel: {
    color: Colors.gray[500],
    fontSize: 14,
    fontWeight: FontWeights.medium,
  },
  detailValue: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    fontSize: 15,
  }
});
