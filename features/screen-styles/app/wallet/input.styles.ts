import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  input: {
    minHeight: 50,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
    paddingHorizontal: Spacing.md,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
  },
  helperText: {
    marginTop: -Spacing.xs,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  topUpStatusCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    backgroundColor: Colors.gray[50],
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  topUpStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  topUpStatusTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  topUpStatusText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    lineHeight: 19,
  },
  topUpReferenceText: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
  },
  historyHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ledgerPanel: {
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    overflow: 'hidden',
  },
  ledgerItem: {
    minHeight: 72,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ledgerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  ledgerTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  ledgerSubtitle: {
    marginTop: 3,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
  },
  ledgerAmountBlock: {
    alignItems: 'flex-end',
    minWidth: 96,
  },
  ledgerAmount: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  ledgerBalance: {
    marginTop: 3,
    color: Colors.gray[500],
    fontSize: 11,
  },
  emptyLedger: {
    minHeight: 116,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  emptyLedgerText: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.6,
  }
});
