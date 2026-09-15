import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  arrivalModalText: {
    marginTop: Spacing.xs,
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  arrivalModalAddressRow: {
    width: '100%',
    minHeight: 48,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[100],
  },
  arrivalModalAddress: {
    flex: 1,
    color: Colors.gray[800],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  arrivalModalGpsStatus: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  arrivalModalGpsStatusText: {
    color: Colors.success,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  arrivalModalHint: {
    marginTop: Spacing.md,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    textAlign: 'center',
  },
  arrivalModalActions: {
    width: '100%',
    marginTop: Spacing.lg,
    flexDirection: 'row',
    gap: Spacing.md,
  },
  arrivalModalLaterButton: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  arrivalModalLaterButtonText: {
    color: Colors.gray[700],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
  }
});
