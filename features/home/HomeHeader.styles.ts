import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { HOME_COLORS } from '@/features/home/homeModel';
import { HOME_DASHBOARD_COLORS } from './homeDashboardTheme';
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  topOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 12,
    paddingHorizontal: 16,
    gap: Spacing.sm,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: Colors.white,
    ...CommonStyles.shadowSm,
  },
  userAvatarText: {
    color: HOME_DASHBOARD_COLORS.rust,
    fontSize: 18,
    fontWeight: FontWeights.bold,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: Colors.white,
    ...CommonStyles.shadowSm,
  },
  notificationBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HOME_DASHBOARD_COLORS.rust,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  notificationBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: FontWeights.bold,
    lineHeight: 12,
  },
  activeTripPill: {
    alignSelf: 'flex-start',
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.white,
    ...CommonStyles.shadowSm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: HOME_COLORS.success,
    marginRight: 7,
  },
  statusText: {
    flexShrink: 1,
    color: HOME_COLORS.body,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
});
