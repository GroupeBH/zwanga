import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  detailLabel: {
    color: Colors.gray[500],
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 4,
    fontWeight: FontWeights.bold,
  },
  detailValue: {
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  nextTripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary + '10',
    gap: Spacing.sm,
  },
  nextTripContent: {
    flex: 1,
  },
  nextTripLabel: {
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
  },
  nextTripValue: {
    marginTop: 2,
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
  },
  countBadge: {
    minWidth: 42,
    minHeight: 38,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xs,
  },
  countBadgeText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  countBadgeLabel: {
    color: Colors.gray[500],
    fontSize: 9,
    fontWeight: FontWeights.semibold,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  vehicleText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
  },
  descriptionText: {
    marginTop: Spacing.md,
    color: Colors.gray[600],
    lineHeight: 21,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  manageButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  manageButtonText: {
    fontWeight: FontWeights.bold,
  },
  pauseButton: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  disabledButton: {
    opacity: 0.6,
  }
});
