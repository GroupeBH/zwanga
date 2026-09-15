import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  sosModalContent: {
    backgroundColor: Colors.gray[50],
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    height: '60%',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  sosModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sosModalIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.danger + '12',
    borderWidth: 1,
    borderColor: Colors.danger + '24',
  },
  securityModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  securityModalKeyboard: {
    flex: 1,
  },
  securityModalHeaderCopy: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  securityModalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  securityModalSubtitle: {
    marginTop: 2,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 19,
  },
  securityModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityModalBody: {
    flex: 1,
  },
  securityModalBodyContent: {
    paddingBottom: Spacing.sm,
  },
  securityModalLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  securityModalLoadingText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  bookingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  bookingModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: Spacing.xl,
    // paddingBottom est défini dynamiquement avec insets.bottom
  },
  bookingStepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  bookingStepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.gray[200],
  },
  bookingStepDotActive: {
    backgroundColor: Colors.primary,
  },
  bookingStepLine: {
    width: 40,
    height: 2,
    backgroundColor: Colors.gray[200],
    marginHorizontal: 4,
  },
  bookingStepLineActive: {
    backgroundColor: Colors.primary,
  },
  bookingStepContent: {
    marginBottom: Spacing.md,
  },
  bookingStepContentInner: {
    paddingBottom: Spacing.xs,
  },
  bookingPreviewHero: {
    minHeight: 76,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary + '10',
    borderWidth: 1,
    borderColor: Colors.primary + '22',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  bookingPreviewIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingPreviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  bookingPreviewTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 3,
  },
  bookingPreviewText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 19,
  },
  bookingSummary: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  bookingSummaryTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  bookingSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 6,
  },
  bookingSummaryPointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 10,
  },
  bookingSummaryPointIcon: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingSummaryPointIconDeparture: {
    backgroundColor: Colors.success,
  },
  bookingSummaryPointIconArrival: {
    backgroundColor: Colors.primary,
  },
  bookingSummaryPointCopy: {
    flex: 1,
    minWidth: 0,
  },
  bookingSummaryPointLabel: {
    fontSize: 11,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  bookingSummaryPointLabelDeparture: {
    color: Colors.successDark,
  },
  bookingSummaryPointLabelArrival: {
    color: Colors.primaryDark,
  },
  bookingSummaryText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  bookingSummaryKycRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.primary + '18',
  },
  bookingSummaryKycText: {
    flex: 1,
    color: Colors.primaryDark,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  bookingModalTitle: {
    fontSize: 22,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 8,
  },
  bookingModalDescription: {
    fontSize: 14,
    color: Colors.gray[500],
    marginBottom: Spacing.xl,
  },
  bookingSeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  bookingSeatButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  bookingSeatInput: {
    flex: 1,
    height: 56,
    marginHorizontal: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.primary + '30',
    backgroundColor: Colors.primary + '05',
    borderRadius: 16,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingModalHint: {
    color: Colors.gray[400],
    fontSize: 12,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  bookingModalPrice: {
    fontSize: 16,
    color: Colors.gray[800],
    marginBottom: Spacing.lg,
    fontWeight: FontWeights.medium,
  },
  bookingModalPriceValue: {
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    fontSize: 18,
  },
  bookingPaymentSection: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  bookingPaymentTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
  }
});
