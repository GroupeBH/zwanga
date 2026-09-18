import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.md,
  },
  date: {
    flex: 1,
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  route: {
    gap: Spacing.sm,
  },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  departureDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.successDark,
  },
  arrivalDot: {
    width: 7,
    height: 7,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  place: {
    flex: 1,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    lineHeight: 22,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  seats: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 6,
  },
  seatsText: {
    flexShrink: 1,
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  seatsCount: {
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  price: {
    flexShrink: 1,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  priceUnit: {
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.regular,
  },
  editButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  editText: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.primaryDark,
  },
});
