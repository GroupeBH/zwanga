import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  modalRouteModeChipText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  modalRouteModeChipTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  modalRouteInput: {
    marginBottom: Spacing.sm,
  },
  modalRoutePointButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  modalRoutePointIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
  },
  modalRoutePointContent: {
    flex: 1,
    marginLeft: Spacing.sm,
    marginRight: Spacing.xs,
  },
  modalRoutePointLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
  },
  modalRoutePointValue: {
    marginTop: 2,
    fontSize: FontSizes.sm,
    color: Colors.gray[900],
    fontWeight: FontWeights.semibold,
  },
  modalRoutePointCoords: {
    marginTop: 2,
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  modalField: {
    marginBottom: Spacing.lg,
  },
  modalLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.gray[700],
    marginBottom: Spacing.xs,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
  },
  modalDatetimeRow: {
    flexDirection: 'row',
  },
  modalDatetimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginRight: Spacing.sm,
  },
  modalDatetimeLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
  },
  modalDatetimeValue: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  iosPickerContainer: {
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  iosPickerCloseButton: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  iosPickerCloseText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  modalActions: {
    flexDirection: 'row',
  },
  modalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  modalButtonSecondary: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  modalButtonSecondaryText: {
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  modalButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  modalButtonPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  }
});
