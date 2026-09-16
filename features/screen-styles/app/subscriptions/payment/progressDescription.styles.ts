import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  progressDescription: {
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    lineHeight: 16,
    textAlign: 'center',
  },
  statusPanel: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    backgroundColor: Colors.white,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  statusPanelCompact: {
    paddingVertical: 8,
  },
  statusIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTextBlock: {
    flex: 1,
  },
  statusTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  statusText: {
    marginTop: 2,
    color: Colors.gray[700],
    fontSize: FontSizes.xs,
    lineHeight: 18,
  },
  referenceText: {
    marginTop: 4,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
    gap: Spacing.sm,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '35',
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  disabled: {
    opacity: 0.6,
  }
});
