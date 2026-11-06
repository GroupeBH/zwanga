import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { StyleSheet } from 'react-native';

export const accessStyles = StyleSheet.create({
  // Unlike footer actions in a row, the access-denied action sits in a column.
  button: {
    flexGrow: 0,
    flexShrink: 0,
    width: '100%',
    maxWidth: 360,
    minHeight: 54,
    alignSelf: 'center',
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowMd,
  },
  label: {
    flexShrink: 1,
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
});
