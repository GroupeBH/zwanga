import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  vehicleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: '#FFF7F3',
    shadowColor: Colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  vehicleCardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: Colors.gray[200],
  },
  vehicleCardAccentActive: {
    backgroundColor: Colors.primary,
  },
  vehicleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  vehicleCardIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleCardIconWrapActive: {
    backgroundColor: Colors.primary,
  },
  vehicleCardStatus: {
    minHeight: 28,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.gray[100],
  },
  vehicleCardStatusActive: {
    backgroundColor: Colors.primary,
  },
  vehicleCardStatusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.gray[600],
  },
  vehicleCardStatusTextActive: {
    color: Colors.white,
  },
  vehicleCardBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleCardBrand: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
  },
  vehicleCardDetails: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  vehiclePlatePill: {
    minHeight: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingHorizontal: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vehiclePlateText: {
    flex: 1,
    fontSize: FontSizes.xs,
    color: Colors.gray[800],
    fontWeight: FontWeights.bold,
  },
  addVehicleButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    justifyContent: 'center',
  },
  addVehicleButtonSecondaryText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
    fontSize: FontSizes.sm,
  },
  // Vehicle Modal Styles
  vehicleModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  vehicleModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  vehicleModalKeyboardAvoiding: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  vehicleModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    maxHeight: '92%',
    minHeight: 0,
    shadowColor: Colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -5 },
    elevation: 20,
  },
  vehicleModalSafeArea: {
    flex: 1,
  },
  vehicleModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  vehicleModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  vehicleModalScrollView: {
    flex: 1,
  },
  vehicleModalScrollContent: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  // Vehicle Form Styles
  vehicleFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleFormTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  vehicleFormInputGroup: {
    gap: Spacing.xs,
  },
  vehicleFormLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  vehicleFormInput: {
    borderWidth: 1.5,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.base,
    backgroundColor: Colors.white,
    shadowColor: Colors.black,
    shadowOpacity: 0.02,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  vehicleFormButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  vehicleFormButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  vehicleFormButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  vehicleFormButtonSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[300],
  },
  vehicleFormButtonPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
  vehicleFormButtonSecondaryText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.semibold,
  },
  // Step Indicator Styles
  stepIndicatorContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    backgroundColor: '#EEF2F6',
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
  },
  stepDotCompleted: {
    backgroundColor: Colors.success,
  },
  stepLine: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.gray[200],
    marginHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  stepLineActive: {
    backgroundColor: Colors.success,
  },
  stepLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.sm,
  },
  stepLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
    color: Colors.gray[500],
    textAlign: 'center',
    flex: 1,
  },
  stepLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  // Route Card Styles (from request.tsx)
  publishMapPreview: {
    height: 238,
    overflow: 'hidden',
    backgroundColor: Colors.gray[200],
  },
  confirmMapPreview: {
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  publishMapPreviewMap: {
    ...StyleSheet.absoluteFillObject,
  }
});
