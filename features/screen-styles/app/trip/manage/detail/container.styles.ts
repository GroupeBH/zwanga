import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyText: {
    color: Colors.gray[600],
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  headerSubtitle: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    margin: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  feedbackSuccess: {
    backgroundColor: Colors.success,
  },
  feedbackError: {
    backgroundColor: Colors.danger,
  },
  feedbackText: {
    flex: 1,
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 100, // Space for sticky footer
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  rateButtonInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  rateButtonInCardText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  viewProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  viewProfileButtonText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  sectionSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginTop: 2,
  },
  sectionIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityQuickButton: {
    marginTop: Spacing.xs,
    minHeight: 44,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
  }
});
