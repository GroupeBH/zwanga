import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { StyleSheet } from 'react-native';
import { SEARCH_COLORS } from './searchTheme';

export const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  count: {
    flexShrink: 1,
    color: SEARCH_COLORS.body,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  sortOptions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  sortButton: {
    minHeight: 44,
    maxWidth: '100%',
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortButtonActive: {
    backgroundColor: Colors.primaryDark,
  },
  sortButtonText: {
    color: Colors.gray[900],
    fontSize: 12,
    fontWeight: FontWeights.semibold,
    textAlign: 'center',
  },
  sortButtonTextActive: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
});
