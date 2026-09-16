import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF2F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: '#EEF2F6',
  },
  closeButton: {
    marginRight: Spacing.lg,
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: Spacing.xs,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.gray[200],
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  identityWarningCard: {
    flexDirection: 'row',
    backgroundColor: Colors.primary + '12',
    borderRadius: BorderRadius.xl,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  identityWarningIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityWarningContent: {
    flex: 1,
  },
  identityWarningTitle: {
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  identityWarningText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    marginVertical: Spacing.xs,
  },
  identityWarningButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  identityWarningButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  routeKycWarningCard: {
    backgroundColor: Colors.primary + '08',
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    borderColor: Colors.primary + '30',
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  routeKycWarningHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  routeKycWarningIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  routeKycWarningTextContainer: {
    flex: 1,
  },
  routeKycWarningTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  routeKycWarningSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    lineHeight: 20,
  },
  routeKycWarningButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
  },
  routeKycWarningButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  routeScrollViewContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  stepContainer: {
    marginTop: 0,
  },
  routeStepContainer: {
    marginTop: 0,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  confirmIntro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  confirmIntroIcon: {
    width: 48,
    height: 48,
    marginBottom: 0,
  },
  confirmIntroText: {
    flex: 1,
    minWidth: 0,
  },
  confirmIntroTitle: {
    fontSize: FontSizes.xl,
    marginBottom: 2,
  },
  confirmIntroSubtitle: {
    textAlign: 'left',
    fontSize: FontSizes.sm,
  },
  iconCircle: {
    width: 80,
    height: 80,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  iconCircleYellow: {
    backgroundColor: 'rgba(247, 184, 1, 0.1)',
  },
  iconCircleGreen: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
  },
  stepTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.sm,
  },
  stepSubtitle: {
    color: Colors.gray[600],
    textAlign: 'center',
    fontSize: FontSizes.base,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  freeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  freeTripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  passengerKycRequirementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  passengerKycRequirementCardActive: {
    borderColor: Colors.primary + '35',
    backgroundColor: Colors.primary + '06',
  },
  passengerKycRequirementContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  passengerKycRequirementIcon: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  passengerKycRequirementIconActive: {
    backgroundColor: Colors.primary,
  },
  passengerKycRequirementCopy: {
    flex: 1,
  },
  recurringToggleCard: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  recurringToggleCardActive: {
    borderColor: Colors.primary + '35',
    backgroundColor: Colors.primary + '06',
  },
  freeTripContent: {
    flex: 1,
    marginRight: Spacing.md,
  },
  freeTripTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
    lineHeight: 21,
  }
});
