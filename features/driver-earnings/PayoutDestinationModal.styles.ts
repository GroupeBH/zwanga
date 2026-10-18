import { StyleSheet } from 'react-native';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';

export const styles = StyleSheet.create({
  amountBlock: { backgroundColor: Colors.gray[50], borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.xl },
  amountLabel: { color: Colors.gray[600], fontSize: FontSizes.sm },
  amount: { color: Colors.gray[900], fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, marginTop: Spacing.xs },
  label: { color: Colors.gray[900], fontSize: FontSizes.base, fontWeight: FontWeights.semibold },
  hint: { color: Colors.gray[600], fontSize: FontSizes.sm, lineHeight: 21, marginVertical: Spacing.sm },
  input: {
    backgroundColor: Colors.gray[50], borderWidth: 1, borderColor: Colors.gray[300], borderRadius: BorderRadius.lg,
    color: Colors.gray[900], fontSize: FontSizes.base, minHeight: 52, paddingHorizontal: Spacing.md, marginTop: Spacing.sm,
  },
  invalidInput: { borderColor: Colors.danger },
  error: { color: Colors.danger, fontSize: FontSizes.sm, marginTop: Spacing.xs },
  defaultButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  defaultButtonText: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  continueButton: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    minHeight: 52, marginTop: Spacing.lg, padding: Spacing.md,
  },
  continueText: { color: Colors.white, fontSize: FontSizes.base, fontWeight: FontWeights.bold },
  disabled: { opacity: 0.45 },
});
