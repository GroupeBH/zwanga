import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  modalOverlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  keyboardAvoidingView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  modalHintWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary + '10',
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary + '22',
  },
  modalHintText: {
    flex: 1,
    fontSize: FontSizes.xs,
    color: Colors.gray[700],
    lineHeight: 17,
  },
  modalBody: {
    maxHeight: 360,
  },
  modalBodyContent: {
    padding: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.lg,
  },
  formLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  textInput: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  phoneInputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  phoneInputContainer: {
    flex: 1,
  },
  contactPickerButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: Spacing.lg,
    // paddingBottom est défini dynamiquement avec insets.bottom
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  saveButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  saveButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  }
});
