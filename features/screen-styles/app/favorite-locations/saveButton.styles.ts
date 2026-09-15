import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  }
});
