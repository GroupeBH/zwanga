import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  editTripFooterButton: {
    backgroundColor: Colors.primary + '08',
  },
  pauseTripFooterButton: {
    width: 82,
    borderColor: Colors.warning + '40',
    backgroundColor: Colors.warning + '10',
    shadowOpacity: 0,
  },
  pauseTripFooterButtonText: {
    color: Colors.warning,
  },
  cancelTripFooterButton: {
    borderColor: Colors.danger + '22',
    backgroundColor: Colors.danger + '08',
  },
  bookingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bookingModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    // paddingBottom est défini dynamiquement avec insets.bottom
  },
  bookingModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  bookingModalDescription: {
    fontSize: FontSizes.base,
    color: Colors.gray[500],
    marginBottom: Spacing.lg,
  },
  bookingSeatInput: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    minHeight: 100,
    textAlignVertical: 'top',
  },
  editRouteLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
    marginBottom: Spacing.xs,
  },
  editRouteInput: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    marginBottom: Spacing.md,
  },
  bookingModalError: {
    color: Colors.danger,
    fontSize: FontSizes.sm,
    marginTop: Spacing.xs,
  },
  bookingModalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  bookingModalButton: {
    flex: 1,
    height: 54,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingModalButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  bookingModalButtonSecondary: {
    backgroundColor: Colors.gray[100],
  },
  bookingModalButtonPrimaryText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  bookingModalButtonSecondaryText: {
    color: Colors.gray[700],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  contactModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  contactModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    // paddingBottom est défini dynamiquement avec insets.bottom
  },
  contactModalHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  contactModalIconWrapper: {
    marginBottom: Spacing.md,
  },
  contactModalIconBadge: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  contactModalSubtitle: {
    fontSize: FontSizes.base,
    color: Colors.gray[500],
    textAlign: 'center',
  },
  contactModalActions: {
    gap: Spacing.md,
  },
  contactModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  contactModalButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  contactModalButtonContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  contactModalButtonTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  contactModalButtonSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 2,
  },
  contactModalButtonCall: {
    borderColor: Colors.success + '20',
  },
  contactModalButtonWhatsApp: {
    borderColor: '#25D36620',
  },
  contactModalCancelButton: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  contactModalCancelText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[500],
  }
});
