import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  bookingPaymentOption: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
  },
  bookingPaymentOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  bookingPaymentCopy: {
    flex: 1,
  },
  bookingPaymentOptionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingPaymentOptionText: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.gray[500],
  },
  bookingModalError: {
    color: Colors.danger,
    marginBottom: Spacing.md,
    fontSize: 13,
    fontWeight: FontWeights.medium,
  },
  bookingModalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  bookingModalButton: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingModalButtonSecondary: {
    backgroundColor: Colors.gray[100],
  },
  bookingModalButtonSecondaryText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.bold,
  },
  bookingModalButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  bookingModalButtonPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  bookingRouteCard: {
    marginBottom: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    backgroundColor: Colors.white,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  bookingRoutePoint: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  bookingManualInputWrap: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: 6,
  },
  bookingManualInputLabel: {
    fontSize: 11,
    fontWeight: FontWeights.bold,
    color: Colors.gray[500],
    textTransform: 'uppercase',
  },
  bookingManualInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    color: Colors.gray[900],
    backgroundColor: Colors.gray[50],
    fontSize: FontSizes.sm,
  },
  bookingRouteCopy: {
    flex: 1,
    minWidth: 0,
  },
  bookingRouteValue: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingRouteDivider: {
    height: 1,
    marginLeft: 68,
    backgroundColor: Colors.gray[100],
  },
  bookingPointIcon: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingPointIconDeparture: {
    backgroundColor: Colors.success,
  },
  bookingPointIconArrival: {
    backgroundColor: Colors.primary,
  },
  bookingDestinationButtonLabel: {
    fontSize: 11,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  bookingDestinationButtonLabelDeparture: {
    color: Colors.successDark,
  },
  bookingDestinationButtonLabelArrival: {
    color: Colors.primaryDark,
  },
  reviewsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  reviewsModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '85%',
    minHeight: '50%',
    padding: Spacing.xl,
    // paddingBottom est défini dynamiquement avec insets.bottom
  },
  reviewsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  reviewsModalTitle: {
    fontSize: 20,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  reviewsModalContent: {
    flex: 1,
  },
  reviewsEmptyText: {
    color: Colors.gray[400],
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  reviewItem: {
    backgroundColor: Colors.gray[50],
    borderRadius: 20,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  reviewItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  reviewAuthor: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    fontSize: 15,
  },
  reviewDate: {
    color: Colors.gray[400],
    fontSize: 12,
    marginBottom: 12,
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  reviewRatingText: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    fontSize: 12,
  },
  reviewComment: {
    color: Colors.gray[700],
    fontSize: 14,
    lineHeight: 20,
  },
  feedbackModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  feedbackModalCard: {
    backgroundColor: Colors.white,
    borderRadius: 32,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  feedbackModalIcon: {
    width: 80,
    height: 80,
    borderRadius: 30,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    elevation: 8,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  feedbackModalTitle: {
    fontSize: 24,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 12,
    textAlign: 'center',
  },
  feedbackModalText: {
    textAlign: 'center',
    color: Colors.gray[500],
    fontSize: 15,
    lineHeight: 22,
    marginBottom: Spacing.xxl,
  },
  feedbackModalActions: {
    flexDirection: 'row',
    width: '100%',
    gap: Spacing.md,
  },
  feedbackModalButton: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackModalSecondary: {
    backgroundColor: Colors.gray[100],
  },
  feedbackModalPrimary: {
    backgroundColor: Colors.primary,
  },
  feedbackModalSecondaryText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.bold,
  },
  feedbackModalPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  passengersContainer: {
    gap: Spacing.md,
  }
});
