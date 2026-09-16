import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  submitButtonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  submitButtonText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  successMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.success + '24',
    backgroundColor: Colors.success + '10',
  },
  successMessageText: {
    flex: 1,
    color: Colors.successDark,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  warningCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  warningContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  warningText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  warningTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.dangerDark,
    marginBottom: Spacing.xs,
    fontSize: FontSizes.base,
  },
  warningMessage: {
    fontSize: FontSizes.sm,
    color: Colors.dangerDark,
    opacity: 0.8,
  },
  reasonsContainer: {
    marginBottom: Spacing.xl,
  },
  reasonsTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
    marginBottom: Spacing.md,
  },
  reasonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  reasonCardActive: {
    borderColor: Colors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  reasonIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    backgroundColor: Colors.gray[100],
  },
  reasonIconActive: {
    backgroundColor: Colors.danger,
  },
  reasonText: {
    flex: 1,
    fontWeight: FontWeights.medium,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
  },
  reasonTextActive: {
    color: Colors.dangerDark,
  }
});
