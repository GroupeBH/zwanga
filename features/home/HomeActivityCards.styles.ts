import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { HOME_COLORS } from '@/features/home/homeModel';
import {
  StyleSheet
} from 'react-native';
export const styles = StyleSheet.create({
  driverReservationCard: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.warning + '33',
    ...CommonStyles.shadowSm,
  },
  driverUpcomingTripCard: {
    borderColor: HOME_COLORS.navy + '33',
  },
  driverReservationIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  driverUpcomingTripIcon: {
    backgroundColor: HOME_COLORS.navySoft,
  },
  driverReservationText: {
    flex: 1,
    minWidth: 0,
  },
  driverReservationLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  driverUpcomingTripLabel: {
    color: HOME_COLORS.navy,
  },
  driverReservationPassenger: {
    marginTop: 2,
    color: HOME_COLORS.ink,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  driverReservationRoute: {
    marginTop: 2,
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
  },
  driverReservationAction: {
    maxWidth: 86,
    marginLeft: Spacing.sm,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  driverReservationTime: {
    color: Colors.gray[600],
    fontSize: 10,
    fontWeight: FontWeights.semibold,
    textAlign: 'right',
  },
  activeRequestCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    ...CommonStyles.shadowSm,
  },
  highlightedRequestCard: {
    borderColor: Colors.primary + '70',
    backgroundColor: '#FFF8F4',
  },
  activeRequestIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '14',
    marginRight: Spacing.sm,
  },
  activeRequestText: {
    flex: 1,
    minWidth: 0,
  },
  activeRequestLabel: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  activeRequestRoute: {
    marginTop: 2,
    color: HOME_COLORS.ink,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  activeRequestTime: {
    marginLeft: Spacing.sm,
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    maxWidth: 88,
    textAlign: 'right',
  }
});
