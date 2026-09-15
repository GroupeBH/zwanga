import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  detailText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
  selectedDriverContainer: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  selectedDriverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedDriverAvatar: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    marginRight: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  selectedDriverLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    marginBottom: 2,
  },
  selectedDriverName: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  descriptionContainer: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  descriptionText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    fontStyle: 'italic',
  },
  cardFooter: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  viewButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  makeOfferButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  makeOfferButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.lg,
  },
  createRequestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  createRequestButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  }
});
