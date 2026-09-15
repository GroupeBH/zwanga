import { BorderRadius, Colors, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  vehicleInfoContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  vehicleDetails: {
    fontSize: 12,
    color: Colors.gray[500],
    marginTop: 2,
    textAlign: 'right',
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    // paddingBottom is set dynamically via useSafeAreaInsets
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  actionsContainer: {
    // Container inside sticky footer
  },
  actionButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: FontWeights.bold,
  },
  actionButtonDisabled: {
    backgroundColor: Colors.gray[300],
    elevation: 0,
    shadowOpacity: 0,
  },
  bookingCard: {
    backgroundColor: Colors.white,
  },
  bookingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  bookingHeaderIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bookingHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '10',
    borderWidth: 1,
    borderColor: Colors.primary + '20',
    marginRight: Spacing.sm,
  },
  bookingHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  bookingCardTitle: {
    fontSize: 17,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingCardSubtitle: {
    fontSize: 13,
    color: Colors.gray[500],
    marginTop: 2,
  },
  bookingStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  bookingStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bookingStatusText: {
    fontSize: 11,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
  },
  bookingCardInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    backgroundColor: Colors.gray[50],
    padding: Spacing.md,
    borderRadius: 14,
  },
  bookingInfoItem: {
    flex: 1,
  },
  bookingInfoLabel: {
    fontSize: 10,
    color: Colors.gray[400],
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: FontWeights.bold,
  },
  bookingInfoValue: {
    fontSize: 14,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingActionsStack: {
    gap: Spacing.sm,
  },
  bookingSecondaryActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  bookingActionButton: {
    height: 48,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  bookingActionPrimary: {
    width: '100%',
    height: 50,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  bookingActionSecondary: {
    flex: 1,
    height: 46,
  },
  bookingActionText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: FontWeights.bold,
  },
  bookingActionPayment: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  bookingActionPaymentText: {
    color: Colors.white,
  },
  bookingActionNavigation: {
    borderColor: Colors.info,
    backgroundColor: Colors.info,
    shadowColor: Colors.info,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 2,
  },
  bookingActionNavigationText: {
    color: Colors.white,
  },
  bookingActionCall: {
    borderColor: Colors.success + '30',
    backgroundColor: Colors.success + '08',
  },
  bookingActionCallText: {
    color: Colors.success,
  },
  bookingActionDanger: {
    borderColor: Colors.danger + '30',
    backgroundColor: Colors.danger + '08',
  },
  bookingActionDangerText: {
    color: Colors.danger,
  },
  confirmationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.secondary + '15',
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  confirmationBannerText: {
    flex: 1,
    fontSize: 12,
    color: Colors.gray[800],
    fontWeight: FontWeights.bold,
  },
  bookingActionConfirm: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  bookingActionConfirmText: {
    color: Colors.white,
  },
  bookingActionRate: {
    backgroundColor: Colors.secondary + '15',
    borderColor: Colors.secondary + '30',
  },
  bookingActionRateText: {
    color: Colors.secondary,
  },
  bookingRefreshingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  bookingRefreshingText: {
    color: Colors.gray[400],
    fontSize: 12,
    marginLeft: 8,
  },
  bookingHintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  bookingHintIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  bookingHintContent: {
    flex: 1,
  },
  bookingHintTitle: {
    fontSize: 14,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingHintSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.gray[500],
  },
  securityModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  securityModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  securityModalContent: {
    backgroundColor: Colors.gray[50],
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    height: '85%',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  }
});
