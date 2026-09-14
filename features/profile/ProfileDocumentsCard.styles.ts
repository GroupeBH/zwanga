import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  documentPackCard: {
    marginTop: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.info + '25',
    padding: Spacing.md,
    gap: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  documentPackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  documentPackIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.info + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentPackContent: {
    flex: 1,
  },
  documentPackTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  documentPackSubtitle: {
    marginTop: 2,
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    lineHeight: 17,
  },
  documentPackButton: {
    minHeight: 44,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.info + '35',
    backgroundColor: Colors.info + '08',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  documentPackButtonText: {
    color: Colors.info,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
});
