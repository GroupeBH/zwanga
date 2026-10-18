import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
    ...CommonStyles.shadowSm,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: Spacing.xl,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    padding: 4,
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  tabButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.full,
  },
  tabButtonActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[500],
  },
  tabTextActive: {
    color: Colors.white,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.danger,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    ...CommonStyles.shadowSm,
  },
  errorText: {
    flex: 1,
    color: Colors.white,
    marginLeft: Spacing.sm,
  },
  errorAction: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  scrollViewContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  loaderContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  loaderText: {
    marginTop: Spacing.sm,
    color: Colors.gray[500],
  },
  bookingCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  bookingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  bookingDriverAvatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    marginRight: Spacing.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bookingHeaderTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  bookingTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingSubtitle: {
    color: Colors.gray[500],
    marginTop: Spacing.xs,
    fontSize: FontSizes.sm,
  },
  statusBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    textTransform: 'uppercase',
  },
  bookingMeta: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  metaDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.gray[200],
    marginHorizontal: Spacing.md,
  },
  bookingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    marginRight: Spacing.sm,
  },
  linkButtonText: {
    marginLeft: Spacing.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  callButton: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
  },
  callButtonText: {
    color: Colors.success,
  },
  dangerButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  dangerButtonText: {
    color: Colors.danger,
  },
  navigationButton: {
    backgroundColor: Colors.primary,
  },
  navigationButtonText: {
    color: Colors.white,
  },
  confirmationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(247, 184, 1, 0.15)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  confirmationBannerText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.gray[800],
    fontWeight: FontWeights.medium,
  },
  confirmButton: {
    backgroundColor: Colors.secondary,
  },
  confirmButtonText: {
    color: Colors.white,
  },
  rateButton: {
    backgroundColor: 'rgba(247, 184, 1, 0.1)',
  },
  rateButtonText: {
    color: Colors.secondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  emptySubtitle: {
    color: Colors.gray[500],
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
  }
});
